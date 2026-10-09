// Camada de dados: SQLite nativo do Node (node:sqlite), sem dependências extras.
// Os valores são guardados em CENTAVOS (inteiro) pra evitar erro de arredondamento
// de ponto flutuante (0.1 + 0.2 !== 0.3).
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const CATEGORIAS = {
  receita: ['Salário', 'Freelance', 'Investimentos', 'Outros'],
  despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Contas', 'Outros'],
}

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

  return db
}

// Converte a linha do banco pro formato da API (centavos -> reais)
function paraApi(linha) {
  if (!linha) return null
  const { valor_centavos, criado_em, id_externo, ...resto } = linha
  return { ...resto, valor: valor_centavos / 100 }
}

export function criarRepositorio(db) {
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

    // Insere várias de uma vez numa transação do banco: ou entra tudo, ou nada.
    // Duplicadas (mesmo id_externo) são ignoradas pelo ON CONFLICT.
    importar(lista) {
      let importadas = 0
      db.exec('BEGIN')
      try {
        for (const t of lista) {
          importadas += sql.inserirImportada.run({ ...paraCentavos(t), id_externo: t.idExterno }).changes
        }
        db.exec('COMMIT')
      } catch (erro) {
        db.exec('ROLLBACK')
        throw erro
      }
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
