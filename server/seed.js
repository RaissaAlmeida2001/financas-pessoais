// Popula o banco com 6 meses de dados de exemplo (fictícios) pra demonstrar o app.
// Uso: npm run seed   (apaga as transações existentes antes!)
import { abrirBanco, criarRepositorio } from './db.js'

const db = abrirBanco(process.env.DB_PATH || 'data/financas.db')
const repo = criarRepositorio(db)
db.exec('DELETE FROM transacoes')

const fixas = [
  { tipo: 'receita', descricao: 'Salário', categoria: 'Salário', valor: 4200, dia: 5 },
  { tipo: 'despesa', descricao: 'Aluguel', categoria: 'Moradia', valor: 1350, dia: 10 },
  { tipo: 'despesa', descricao: 'Internet e celular', categoria: 'Contas', valor: 159.9, dia: 12 },
  { tipo: 'despesa', descricao: 'Conta de luz', categoria: 'Contas', valor: 0, dia: 15 },
  { tipo: 'despesa', descricao: 'Mercado', categoria: 'Alimentação', valor: 0, dia: 7 },
  { tipo: 'despesa', descricao: 'Mercado', categoria: 'Alimentação', valor: 0, dia: 21 },
  { tipo: 'despesa', descricao: 'Transporte por app', categoria: 'Transporte', valor: 0, dia: 18 },
  { tipo: 'despesa', descricao: 'Lanche e restaurantes', categoria: 'Lazer', valor: 0, dia: 26 },
]

// gerador pseudo-aleatório com semente fixa: o seed sempre gera os mesmos dados
let semente = 42
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647)
const entre = (min, max) => Math.round((min + aleatorio() * (max - min)) * 100) / 100

const variaveis = {
  'Conta de luz': [110, 190],
  Mercado: [280, 520],
  'Transporte por app': [90, 240],
  'Lanche e restaurantes': [120, 380],
}

const hoje = new Date()
let total = 0
for (let i = 5; i >= 0; i--) {
  const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
  const mes = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`

  for (const f of fixas) {
    const faixa = variaveis[f.descricao]
    const valor = f.valor || (faixa ? entre(...faixa) : 0)
    if (!valor) continue
    repo.criar({ ...f, valor, data: `${mes}-${String(f.dia).padStart(2, '0')}` })
    total++
  }

  if (i % 2 === 0) {
    repo.criar({ tipo: 'receita', descricao: 'Projeto freelance', categoria: 'Freelance', valor: entre(400, 1200), data: `${mes}-20` })
    total++
  }
  if (i % 3 === 1) {
    repo.criar({ tipo: 'despesa', descricao: 'Consulta e farmácia', categoria: 'Saúde', valor: entre(80, 260), data: `${mes}-14` })
    repo.criar({ tipo: 'despesa', descricao: 'Roupas', categoria: 'Compras', valor: entre(150, 420), data: `${mes}-23` })
    total += 2
  }
}

console.log(`✓ ${total} transações de exemplo criadas (últimos 6 meses).`)
