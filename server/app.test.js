// Testes da API com o test runner nativo do Node (node --test), usando banco em memória.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { abrirBanco, criarRepositorio } from './db.js'
import { criarApp } from './app.js'

let servidor
let base

before(async () => {
  const app = criarApp(criarRepositorio(abrirBanco(':memory:')))
  await new Promise(ok => { servidor = app.listen(0, ok) })
  base = `http://localhost:${servidor.address().port}/api`
})

after(() => {
  servidor.closeAllConnections()
  servidor.close()
})

const json = (metodo, caminho, corpo) =>
  fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })

const valida = { tipo: 'despesa', descricao: 'Mercado', valor: 150.75, categoria: 'Alimentação', data: '2026-10-05' }

test('cria, lista, edita e remove uma transação', async () => {
  const criada = await json('POST', '/transacoes', valida)
  assert.equal(criada.status, 201)
  const t = await criada.json()
  assert.equal(t.valor, 150.75)

  const lista = await (await json('GET', '/transacoes?mes=2026-10')).json()
  assert.ok(lista.some(x => x.id === t.id))

  const editada = await json('PUT', `/transacoes/${t.id}`, { ...valida, valor: 99.9 })
  assert.equal(editada.status, 200)
  assert.equal((await editada.json()).valor, 99.9)

  assert.equal((await json('DELETE', `/transacoes/${t.id}`)).status, 204)
  assert.equal((await json('DELETE', `/transacoes/${t.id}`)).status, 404)
})

test('resumo soma receitas, despesas e agrupa por categoria', async () => {
  await json('POST', '/transacoes', { tipo: 'receita', descricao: 'Salário', valor: 3000, categoria: 'Salário', data: '2026-09-05' })
  await json('POST', '/transacoes', { ...valida, data: '2026-09-07', valor: 0.1 })
  await json('POST', '/transacoes', { ...valida, data: '2026-09-08', valor: 0.2 })
  await json('POST', '/transacoes', { ...valida, data: '2026-09-09', categoria: 'Lazer', valor: 50 })

  const r = await (await json('GET', '/resumo?mes=2026-09')).json()
  assert.equal(r.receitas, 3000)
  assert.equal(r.despesas, 50.3) // centavos evitam o 0.30000000000000004
  assert.equal(r.saldo, 2949.7)
  assert.deepEqual(r.porCategoria, [
    { categoria: 'Lazer', total: 50 },
    { categoria: 'Alimentação', total: 0.3 },
  ])
})

test('evolução devolve todos os meses, mesmo sem lançamentos', async () => {
  const e = await (await json('GET', '/evolucao?ate=2026-10&meses=3')).json()
  assert.deepEqual(e.map(m => m.mes), ['2026-08', '2026-09', '2026-10'])
  assert.equal(e[0].receitas, 0)
  assert.equal(e[1].receitas, 3000)
})

test('rejeita dados inválidos com mensagens por campo', async () => {
  const r = await json('POST', '/transacoes', { tipo: 'x', descricao: ' ', valor: -5, data: '2026-02-31' })
  assert.equal(r.status, 400)
  const { campos } = await r.json()
  assert.ok(campos.tipo && campos.descricao && campos.valor && campos.data)

  const categoriaErrada = await json('POST', '/transacoes', { ...valida, categoria: 'Salário' })
  assert.equal(categoriaErrada.status, 400)

  const centavosDemais = await json('POST', '/transacoes', { ...valida, valor: 10.555 })
  assert.equal(centavosDemais.status, 400)
})

test('valida parâmetros de mês, id e JSON malformado', async () => {
  assert.equal((await json('GET', '/transacoes?mes=2026-13')).status, 400)
  assert.equal((await json('GET', '/resumo')).status, 400)
  assert.equal((await json('PUT', '/transacoes/abc', valida)).status, 400)
  assert.equal((await json('PUT', '/transacoes/99999', valida)).status, 404)

  const quebrado = await fetch(base + '/transacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ isso não é json',
  })
  assert.equal(quebrado.status, 400)
})
