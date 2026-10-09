// Testes das categorias personalizadas (banco em memória)
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

const req = (metodo, caminho, corpo) =>
  fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })

test('cria categorias padrão no primeiro uso, com "Outros" por último', async () => {
  const c = await (await req('GET', '/categorias')).json()
  assert.equal(c.despesa[0], 'Moradia')
  assert.equal(c.despesa.at(-1), 'Outros')
  assert.equal(c.receita.at(-1), 'Outros')
})

test('cria categoria nova e usa ela em transações e na importação', async () => {
  const criada = await req('POST', '/categorias', { tipo: 'despesa', nome: '  Pets ', palavrasChave: 'Petz, cobasi, petz' })
  assert.equal(criada.status, 201)
  const cat = await criada.json()
  assert.equal(cat.nome, 'Pets')
  assert.equal(cat.palavras_chave, 'petz, cobasi')

  const t = await req('POST', '/transacoes', { tipo: 'despesa', descricao: 'Ração', valor: 89.9, categoria: 'Pets', data: '2026-10-02' })
  assert.equal(t.status, 201)

  const previa = await (await req('POST', '/importacao/previa', { conteudo: 'Data,Valor,Descrição\n03/10/2026,-45.00,COBASI SOROCABA' })).json()
  assert.equal(previa.transacoes[0].categoria, 'Pets')
})

test('não deixa nome repetido (sem diferenciar maiúsculas) nem vazio', async () => {
  assert.equal((await req('POST', '/categorias', { tipo: 'despesa', nome: 'pets' })).status, 400)
  assert.equal((await req('POST', '/categorias', { tipo: 'despesa', nome: '   ' })).status, 400)
  assert.equal((await req('POST', '/categorias', { tipo: 'outro', nome: 'X' })).status, 400)
  // o mesmo nome em outro tipo pode
  assert.equal((await req('POST', '/categorias', { tipo: 'receita', nome: 'Pets' })).status, 201)
})

test('renomear atualiza as transações; excluir manda pra "Outros"', async () => {
  const lista = await (await req('GET', '/categorias/detalhes')).json()
  const pets = lista.find(c => c.tipo === 'despesa' && c.nome === 'Pets')
  assert.equal(pets.uso, 1)

  const ren = await req('PUT', `/categorias/${pets.id}`, { nome: 'Bichinhos', palavrasChave: ['petz'] })
  assert.equal(ren.status, 200)
  let transacoes = await (await req('GET', '/transacoes?mes=2026-10')).json()
  assert.equal(transacoes.find(t => t.descricao === 'Ração').categoria, 'Bichinhos')

  const exc = await (await req('DELETE', `/categorias/${pets.id}`)).json()
  assert.deepEqual(exc, { movidas: 1 })
  transacoes = await (await req('GET', '/transacoes?mes=2026-10')).json()
  assert.equal(transacoes.find(t => t.descricao === 'Ração').categoria, 'Outros')

  // a categoria excluída não vale mais em transações novas
  const t = await req('POST', '/transacoes', { tipo: 'despesa', descricao: 'X', valor: 1, categoria: 'Bichinhos', data: '2026-10-02' })
  assert.equal(t.status, 400)
})

test('"Outros" não pode ser excluída nem renomeada', async () => {
  const outros = (await (await req('GET', '/categorias/detalhes')).json()).find(c => c.nome === 'Outros')
  assert.equal((await req('DELETE', `/categorias/${outros.id}`)).status, 400)
  assert.equal((await req('PUT', `/categorias/${outros.id}`, { nome: 'Diversos' })).status, 400)
  assert.equal((await req('DELETE', '/categorias/99999')).status, 404)
})
