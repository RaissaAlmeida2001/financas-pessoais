// Rotas da API. Recebe o repositório por parâmetro pra facilitar os testes
// (nos testes usamos um banco em memória).
import express from 'express'
import { CATEGORIA_FIXA, CORES } from './db.js'
import { validarTransacao, validarCategoria, MES_REGEX } from './validacao.js'
import { lerExtrato } from './importacao.js'

const MAX_IMPORTACAO = 5000

export function criarApp(repo) {
  const app = express()
  // extratos podem ser grandes; o resto da API aceita só corpos pequenos
  app.use('/api/importacao', express.json({ limit: '5mb' }))
  app.use(express.json({ limit: '10kb' }))

  const api = express.Router()

  // ?mes=AAAA-MM é obrigatório nas rotas que filtram por mês
  function exigirMes(req, res) {
    const { mes } = req.query
    if (!MES_REGEX.test(mes ?? '')) {
      res.status(400).json({ erro: 'Parâmetro "mes" deve estar no formato AAAA-MM.' })
      return null
    }
    return mes
  }

  function lerId(req, res) {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ erro: 'ID inválido.' })
      return null
    }
    return id
  }

  // ——— categorias ———
  api.get('/categorias', (_req, res) => res.json(repo.nomesCategorias()))
  api.get('/categorias/detalhes', (_req, res) => res.json(repo.listarCategorias()))
  api.get('/categorias/cores', (_req, res) => res.json(CORES))

  api.post('/categorias', (req, res) => {
    const { dados, erros } = validarCategoria(req.body, { exigirTipo: true })
    if (!erros.nome && repo.nomeEmUso(dados.tipo, dados.nome)) erros.nome = 'Já existe uma categoria com esse nome.'
    if (Object.keys(erros).length) return res.status(400).json({ erro: 'Dados inválidos.', campos: erros })
    res.status(201).json(repo.criarCategoria(dados))
  })

  api.put('/categorias/:id', (req, res) => {
    const id = lerId(req, res)
    if (!id) return
    const atual = repo.buscarCategoria(id)
    if (!atual) return res.status(404).json({ erro: 'Categoria não encontrada.' })
    const { dados, erros } = validarCategoria(req.body, { exigirTipo: false })
    if (atual.fixa && dados.nome !== atual.nome) erros.nome = `A categoria "${CATEGORIA_FIXA}" não pode ser renomeada.`
    if (!erros.nome && repo.nomeEmUso(atual.tipo, dados.nome, id)) erros.nome = 'Já existe uma categoria com esse nome.'
    if (Object.keys(erros).length) return res.status(400).json({ erro: 'Dados inválidos.', campos: erros })
    res.json(repo.atualizarCategoria(id, dados))
  })

  api.delete('/categorias/:id', (req, res) => {
    const id = lerId(req, res)
    if (!id) return
    const atual = repo.buscarCategoria(id)
    if (!atual) return res.status(404).json({ erro: 'Categoria não encontrada.' })
    if (atual.fixa) return res.status(400).json({ erro: `A categoria "${CATEGORIA_FIXA}" não pode ser excluída.` })
    res.json(repo.removerCategoria(id))
  })


  api.get('/transacoes', (req, res) => {
    const mes = exigirMes(req, res)
    if (!mes) return
    const tipo = ['receita', 'despesa'].includes(req.query.tipo) ? req.query.tipo : null
    res.json(repo.listar(mes, tipo))
  })

  api.post('/transacoes', (req, res) => {
    const { dados, erros } = validarTransacao(req.body, repo.nomesCategorias())
    if (Object.keys(erros).length) return res.status(400).json({ erro: 'Dados inválidos.', campos: erros })
    res.status(201).json(repo.criar(dados))
  })

  api.put('/transacoes/:id', (req, res) => {
    const id = lerId(req, res)
    if (!id) return
    const { dados, erros } = validarTransacao(req.body, repo.nomesCategorias())
    if (Object.keys(erros).length) return res.status(400).json({ erro: 'Dados inválidos.', campos: erros })
    const atualizada = repo.atualizar(id, dados)
    if (!atualizada) return res.status(404).json({ erro: 'Transação não encontrada.' })
    res.json(atualizada)
  })

  api.delete('/transacoes/:id', (req, res) => {
    const id = lerId(req, res)
    if (!id) return
    if (!repo.remover(id)) return res.status(404).json({ erro: 'Transação não encontrada.' })
    res.status(204).end()
  })

  api.get('/resumo', (req, res) => {
    const mes = exigirMes(req, res)
    if (!mes) return
    res.json(repo.resumo(mes))
  })

  api.get('/evolucao', (req, res) => {
    const ate = req.query.ate
    if (!MES_REGEX.test(ate ?? '')) return res.status(400).json({ erro: 'Parâmetro "ate" deve estar no formato AAAA-MM.' })
    const meses = Math.min(Math.max(Number(req.query.meses) || 6, 1), 24)
    res.json(repo.evolucao(ate, meses))
  })

  // 1º passo: lê o arquivo e devolve a prévia (nada é salvo ainda)
  api.post('/importacao/previa', (req, res) => {
    const resultado = lerExtrato(req.body?.conteudo, repo.regrasCategorias())
    if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
    const transacoes = resultado.transacoes.slice(0, MAX_IMPORTACAO).map(t => ({ ...t, duplicada: repo.jaImportada(t.idExterno) }))
    res.json({ formato: resultado.formato, transacoes, total: resultado.transacoes.length })
  })

  // 2º passo: salva as transações que a pessoa confirmou (já revisadas na prévia)
  api.post('/importacao', (req, res) => {
    const lista = req.body?.transacoes
    if (!Array.isArray(lista) || lista.length === 0) return res.status(400).json({ erro: 'Nenhuma transação pra importar.' })
    if (lista.length > MAX_IMPORTACAO) return res.status(400).json({ erro: `Importe no máximo ${MAX_IMPORTACAO} por vez.` })

    const validas = []
    const categorias = repo.nomesCategorias()
    for (const [i, item] of lista.entries()) {
      const { dados, erros } = validarTransacao(item, categorias)
      if (Object.keys(erros).length) return res.status(400).json({ erro: `Linha ${i + 1}: ${Object.values(erros)[0]}` })
      if (typeof item.idExterno !== 'string' || !/^(ofx|hash):[\w.\-:]{1,120}$/.test(item.idExterno)) {
        return res.status(400).json({ erro: `Linha ${i + 1}: identificador inválido.` })
      }
      validas.push({ ...dados, idExterno: item.idExterno })
    }
    res.status(201).json(repo.importar(validas))
  })

  app.use('/api', api)

  // JSON malformado e erros inesperados viram respostas JSON, sem vazar stack trace
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' })
    console.error(err)
    res.status(500).json({ erro: 'Erro interno.' })
  })

  return app
}
