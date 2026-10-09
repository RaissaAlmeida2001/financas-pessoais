// Rotas da API. Recebe o repositório por parâmetro pra facilitar os testes
// (nos testes usamos um banco em memória).
import express from 'express'
import { CATEGORIAS } from './db.js'
import { validarTransacao, MES_REGEX } from './validacao.js'

export function criarApp(repo) {
  const app = express()
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

  api.get('/categorias', (_req, res) => res.json(CATEGORIAS))

  api.get('/transacoes', (req, res) => {
    const mes = exigirMes(req, res)
    if (!mes) return
    const tipo = ['receita', 'despesa'].includes(req.query.tipo) ? req.query.tipo : null
    res.json(repo.listar(mes, tipo))
  })

  api.post('/transacoes', (req, res) => {
    const { dados, erros } = validarTransacao(req.body)
    if (Object.keys(erros).length) return res.status(400).json({ erro: 'Dados inválidos.', campos: erros })
    res.status(201).json(repo.criar(dados))
  })

  api.put('/transacoes/:id', (req, res) => {
    const id = lerId(req, res)
    if (!id) return
    const { dados, erros } = validarTransacao(req.body)
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

  app.use('/api', api)

  // JSON malformado e erros inesperados viram respostas JSON, sem vazar stack trace
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' })
    console.error(err)
    res.status(500).json({ erro: 'Erro interno.' })
  })

  return app
}
