// Camada de dados: SQLite nativo do Node (node:sqlite), sem dependências extras.
// Os valores são guardados em CENTAVOS (inteiro) pra evitar erro de arredondamento
// de ponto flutuante (0.1 + 0.2 !== 0.3).
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Categorias criadas no primeiro uso. Depois disso ficam no banco e podem ser
// renomeadas, excluídas ou ganhar palavras-chave novas pela tela "Categorias".
export const CATEGORIAS_PADRAO = {
  despesa: [
    ['Moradia', 'aluguel, condominio, iptu, imobiliaria'],
    ['Alimentação', 'mercado, supermerc, atacad, assai, carrefour, pao de acucar, padaria, acougue, hortifruti, ifood, rappi, restaurante, lanchonete, burger, mcdonald, pizza, cafe, cafeteria, starbucks, ze delivery'],
    ['Transporte', 'uber, 99app, 99 pop, cabify, posto, combust, shell, ipiranga, petrobras, br mania, estaciona, pedagio, sem parar, veloe, metro, onibus, bilhete unico, cptm'],
    ['Saúde', 'farmacia, drogaria, droga raia, drogasil, pague menos, hospital, clinica, laborator, consulta, dentist, odonto, unimed, amil, hapvida, academia, smart fit, smartfit'],
    ['Educação', 'curso, escola, faculdade, universidade, udemy, alura, coursera, livraria, livro'],
    ['Lazer', 'netflix, spotify, disney, prime video, hbo, max, youtube, cinema, ingresso, show, steam, playstation, xbox, bar, viagem, hotel, airbnb, booking'],
    ['Compras', 'amazon, mercado livre, mercadolivre, shopee, shein, aliexpress, magalu, magazine, americanas, renner, riachuelo, c&a, zara, loja'],
    ['Contas', 'energia, eletric, cpfl, enel, sabesp, saae, agua, gas, comgas, internet, vivo, claro, tim, oi, net, telefon, celular, boleto, fatura'],
  ],
  receita: [
    ['Salário', 'salario, folha, pagamento de salario, proventos, remuneracao'],
    ['Freelance', 'freela, servico prestado, nota fiscal'],
    ['Investimentos', 'rendimento, resgate, dividendo, juros, cdb, tesouro, aplicacao'],
  ],
}

// "Outros" existe nos dois tipos e não pode ser excluída: é pra onde vão as
// transações de uma categoria excluída.
export const CATEGORIA_FIXA = 'Outros'

export function abrirBanco(caminho = 'data/financas.db') {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true })
  const db = new DatabaseSync(caminho)

  db.exec(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo            TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
      descricao       TEXT    NOT NULL,
      valor_centavos  INTEGER NOT NULL CHECK (valor_centavos > 0),
      categoria       TEXT    NOT NULL,
      data            TEXT    NOT NULL,               -- AAAA-MM-DD
      criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes (data);
  `)

  // migração: coluna pra reconhecer transações importadas de extrato (evita duplicar)
  const colunas = db.prepare('PRAGMA table_info(transacoes)').all().map(c => c.name)
  if (!colunas.includes('id_externo')) db.exec('ALTER TABLE transacoes ADD COLUMN id_externo TEXT')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_id_externo ON transacoes (id_externo) WHERE id_externo IS NOT NULL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo            TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
      nome            TEXT    NOT NULL,
      palavras_chave  TEXT    NOT NULL DEFAULT '',
      fixa            INTEGER NOT NULL DEFAULT 0,
      UNIQUE (tipo, nome COLLATE NOCASE)
    );
  `)
  if (db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n === 0) {
    const inserir = db.prepare('INSERT INTO categorias (tipo, nome, palavras_chave, fixa) VALUES (?, ?, ?, ?)')
    for (const [tipo, lista] of Object.entries(CATEGORIAS_PADRAO)) {
      for (const [nome, palavras] of lista) inserir.run(tipo, nome, palavras, 0)
      inserir.run(tipo, CATEGORIA_FIXA, '', 1)
    }
  }

  return db
}

// Converte a linha do banco pro formato da API (centavos -> reais)
function paraApi(linha) {
  if (!linha) return null
  const { valor_centavos, criado_em, id_externo, ...resto } = linha
  return { ...resto, valor: valor_centavos / 100 }
}

const separarPalavras = texto => texto.split(',').map(p => p.trim()).filter(Boolean)

export function criarRepositorio(db) {
  // executa várias escritas como uma só: se uma falhar, nenhuma é aplicada
  function emTransacao(fn) {
    db.exec('BEGIN')
    try {
      fn()
      db.exec('COMMIT')
    } catch (erro) {
      db.exec('ROLLBACK')
      throw erro
    }
  }

  const sql = {
    listar: db.prepare(`
      SELECT * FROM transacoes
      WHERE substr(data, 1, 7) = :mes AND (:tipo IS NULL OR tipo = :tipo)
      ORDER BY data DESC, id DESC
    `),
    buscar: db.prepare('SELECT * FROM transacoes WHERE id = ?'),
    inserir: db.prepare(`
      INSERT INTO transacoes (tipo, descricao, valor_centavos, categoria, data)
      VALUES (:tipo, :descricao, :valor_centavos, :categoria, :data)
    `),
    atualizar: db.prepare(`
      UPDATE transacoes
      SET tipo = :tipo, descricao = :descricao, valor_centavos = :valor_centavos,
          categoria = :categoria, data = :data
      WHERE id = :id
    `),
    remover: db.prepare('DELETE FROM transacoes WHERE id = ?'),
    inserirImportada: db.prepare(`
      INSERT INTO transacoes (tipo, descricao, valor_centavos, categoria, data, id_externo)
      VALUES (:tipo, :descricao, :valor_centavos, :categoria, :data, :id_externo)
      ON CONFLICT (id_externo) WHERE id_externo IS NOT NULL DO NOTHING
    `),
    existeExterno: db.prepare('SELECT 1 FROM transacoes WHERE id_externo = ?'),
    categorias: db.prepare(`
      SELECT c.id, c.tipo, c.nome, c.palavras_chave, c.fixa,
             (SELECT COUNT(*) FROM transacoes t WHERE t.tipo = c.tipo AND t.categoria = c.nome) AS uso
      FROM categorias c
      ORDER BY c.tipo, c.fixa, c.id
    `),
    categoria: db.prepare('SELECT * FROM categorias WHERE id = ?'),
    categoriaPorNome: db.prepare('SELECT * FROM categorias WHERE tipo = ? AND nome = ? COLLATE NOCASE'),
    inserirCategoria: db.prepare('INSERT INTO categorias (tipo, nome, palavras_chave) VALUES (?, ?, ?)'),
    atualizarCategoria: db.prepare('UPDATE categorias SET nome = ?, palavras_chave = ? WHERE id = ?'),
    removerCategoria: db.prepare('DELETE FROM categorias WHERE id = ?'),
    moverTransacoes: db.prepare('UPDATE transacoes SET categoria = ? WHERE tipo = ? AND categoria = ?'),
    totais: db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor_centavos END), 0) AS receitas,
        COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor_centavos END), 0) AS despesas
      FROM transacoes
      WHERE substr(data, 1, 7) = ?
    `),
    porCategoria: db.prepare(`
      SELECT categoria, SUM(valor_centavos) AS total
      FROM transacoes
      WHERE tipo = 'despesa' AND substr(data, 1, 7) = ?
      GROUP BY categoria
      ORDER BY total DESC
    `),
    evolucao: db.prepare(`
      SELECT
        substr(data, 1, 7) AS mes,
        COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor_centavos END), 0) AS receitas,
        COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor_centavos END), 0) AS despesas
      FROM transacoes
      WHERE substr(data, 1, 7) BETWEEN ? AND ?
      GROUP BY mes
    `),
  }

  const paraCentavos = t => ({
    tipo: t.tipo,
    descricao: t.descricao,
    valor_centavos: Math.round(t.valor * 100),
    categoria: t.categoria,
    data: t.data,
  })

  return {
    listar: (mes, tipo = null) => sql.listar.all({ mes, tipo }).map(paraApi),
    buscar: id => paraApi(sql.buscar.get(id)),
    criar(t) {
      const { lastInsertRowid } = sql.inserir.run(paraCentavos(t))
      return paraApi(sql.buscar.get(lastInsertRowid))
    },
    atualizar(id, t) {
      const { changes } = sql.atualizar.run({ ...paraCentavos(t), id })
      return changes ? paraApi(sql.buscar.get(id)) : null
    },
    remover: id => sql.remover.run(id).changes > 0,

    jaImportada: idExterno => Boolean(sql.existeExterno.get(idExterno)),

    // ——— categorias ———
    // { receita: ['Salário', ...], despesa: [...] } — usado no formulário e na validação
    nomesCategorias() {
      const mapa = { receita: [], despesa: [] }
      for (const c of sql.categorias.all()) mapa[c.tipo].push(c.nome)
      return mapa
    },
    listarCategorias: () =>
      sql.categorias.all().map(c => ({
        id: c.id,
        tipo: c.tipo,
        nome: c.nome,
        palavrasChave: separarPalavras(c.palavras_chave),
        fixa: Boolean(c.fixa),
        uso: c.uso,
      })),
    // regras pra categorização automática da importação
    regrasCategorias: () =>
      sql.categorias.all().filter(c => !c.fixa).map(c => ({ tipo: c.tipo, nome: c.nome, palavras: separarPalavras(c.palavras_chave) })),
    nomeEmUso(tipo, nome, ignorarId) {
      const existente = sql.categoriaPorNome.get(tipo, nome)
      return Boolean(existente && existente.id !== ignorarId)
    },
    buscarCategoria: id => sql.categoria.get(id),
    criarCategoria({ tipo, nome, palavrasChave }) {
      const { lastInsertRowid } = sql.inserirCategoria.run(tipo, nome, palavrasChave.join(', '))
      return sql.categoria.get(lastInsertRowid)
    },
    // Renomear também atualiza as transações que usam o nome antigo (tudo ou nada)
    atualizarCategoria(id, { nome, palavrasChave }) {
      const atual = sql.categoria.get(id)
      emTransacao(() => {
        sql.atualizarCategoria.run(nome, palavrasChave.join(', '), id)
        if (atual.nome !== nome) sql.moverTransacoes.run(nome, atual.tipo, atual.nome)
      })
      return sql.categoria.get(id)
    },
    // Excluir manda as transações da categoria pra "Outros"
    removerCategoria(id) {
      const atual = sql.categoria.get(id)
      let movidas = 0
      emTransacao(() => {
        movidas = Number(sql.moverTransacoes.run(CATEGORIA_FIXA, atual.tipo, atual.nome).changes)
        sql.removerCategoria.run(id)
      })
      return { movidas }
    },

    // Insere várias de uma vez numa transação do banco: ou entra tudo, ou nada.
    // Duplicadas (mesmo id_externo) são ignoradas pelo ON CONFLICT.
    importar(lista) {
      let importadas = 0
      emTransacao(() => {
        for (const t of lista) {
          importadas += Number(sql.inserirImportada.run({ ...paraCentavos(t), id_externo: t.idExterno }).changes)
        }
      })
      return { importadas, ignoradas: lista.length - importadas }
    },

    resumo(mes) {
      const { receitas, despesas } = sql.totais.get(mes)
      return {
        mes,
        receitas: receitas / 100,
        despesas: despesas / 100,
        saldo: (receitas - despesas) / 100,
        porCategoria: sql.porCategoria.all(mes).map(c => ({ categoria: c.categoria, total: c.total / 100 })),
      }
    },

    // Últimos N meses até `ate` (inclusive), preenchendo com zero os meses sem lançamento
    evolucao(ate, meses = 6) {
      const lista = []
      const [ano, mes] = ate.split('-').map(Number)
      for (let i = meses - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
        lista.push(d.toISOString().slice(0, 7))
      }
      const linhas = new Map(sql.evolucao.all(lista[0], lista.at(-1)).map(l => [l.mes, l]))
      return lista.map(m => ({
        mes: m,
        receitas: (linhas.get(m)?.receitas ?? 0) / 100,
        despesas: (linhas.get(m)?.despesas ?? 0) / 100,
      }))
    },
  }
}
