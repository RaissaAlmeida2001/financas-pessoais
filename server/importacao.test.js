// Testes do leitor de extratos. Os extratos abaixo são FICTÍCIOS, no formato de cada banco.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerValor, lerData, categorizar, lerExtrato } from './importacao.js'
import { abrirBanco, criarRepositorio } from './db.js'
import { criarApp } from './app.js'

test('lê valores nos formatos brasileiro e americano', () => {
  assert.equal(lerValor('1.234,56'), 1234.56)
  assert.equal(lerValor('-1234.56'), -1234.56)
  assert.equal(lerValor('R$ -12,30'), -12.3)
  assert.equal(lerValor('(12,30)'), -12.3)
  assert.equal(lerValor('45,00-'), -45)
  assert.equal(lerValor('1,234.56'), 1234.56)
  assert.ok(Number.isNaN(lerValor('abc')))
})

test('lê datas em vários formatos e recusa datas impossíveis', () => {
  assert.equal(lerData('05/10/2026'), '2026-10-05')
  assert.equal(lerData('05/10/26'), '2026-10-05')
  assert.equal(lerData('2026-10-05'), '2026-10-05')
  assert.equal(lerData('20261005120000[-3:BRT]'), '2026-10-05')
  assert.equal(lerData('31/02/2026'), null)
})

test('categoriza pela descrição', () => {
  assert.equal(categorizar('UBER *TRIP', 'despesa'), 'Transporte')
  assert.equal(categorizar('Supermercado Dia', 'despesa'), 'Alimentação')
  assert.equal(categorizar('DROGASIL 123', 'despesa'), 'Saúde')
  assert.equal(categorizar('Netflix.com', 'despesa'), 'Lazer')
  assert.equal(categorizar('Pagamento de salário', 'receita'), 'Salário')
  assert.equal(categorizar('Transferência recebida', 'receita'), 'Outros')
})

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003000000[-3:BRT]<TRNAMT>-89.90<FITID>A1<MEMO>COMPRA CARTAO - PADARIA SAO JOSE
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>4200.00<FITID>A2<NAME>EMPRESA LTDA<MEMO>SALARIO
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>-35,50<FITID>A3<MEMO>UBER DO BRASIL
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

test('lê OFX (Itaú, Bradesco, BB, Caixa...)', () => {
  const { formato, transacoes } = lerExtrato(OFX)
  assert.equal(formato, 'OFX')
  assert.equal(transacoes.length, 3)
  assert.deepEqual(
    transacoes.map(t => [t.data, t.tipo, t.valor, t.categoria]),
    [
      ['2026-10-03', 'despesa', 89.9, 'Alimentação'],
      ['2026-10-05', 'receita', 4200, 'Salário'],
      ['2026-10-07', 'despesa', 35.5, 'Transporte'],
    ]
  )
  assert.equal(transacoes[1].descricao, 'EMPRESA LTDA SALARIO')
})

test('lê CSV da conta Nubank', () => {
  const csv = `Data,Valor,Identificador,Descrição
01/10/2026,-52.30,abc-1,Compra no débito - Supermercado Bom Preço
02/10/2026,150.00,abc-2,Transferência recebida pelo Pix
02/10/2026,-8.50,abc-3,Compra no débito - Café
02/10/2026,-8.50,abc-4,Compra no débito - Café`
  const { formato, transacoes } = lerExtrato(csv)
  assert.equal(formato, 'CSV')
  assert.equal(transacoes.length, 4)
  assert.equal(transacoes[0].categoria, 'Alimentação')
  assert.equal(transacoes[1].tipo, 'receita')
  // dois cafés iguais no mesmo dia não podem virar "duplicados"
  assert.notEqual(transacoes[2].idExterno, transacoes[3].idExterno)
})

test('lê CSV da fatura do cartão Nubank (valor positivo = compra)', () => {
  const csv = `date,title,amount
2026-10-04,Ifood *Restaurante,42.90
2026-10-06,Pagamento recebido,-500.00`
  const { transacoes } = lerExtrato(csv)
  assert.deepEqual(transacoes.map(t => [t.tipo, t.valor]), [['despesa', 42.9], ['receita', 500]])
})

test('lê CSV com ponto e vírgula e colunas de crédito/débito', () => {
  const csv = `Extrato de conta corrente
Agência 0000 Conta 00000-0
Data;Histórico;Crédito;Débito;Saldo
05/10/2026;PIX RECEBIDO;1.000,00;;1.000,00
06/10/2026;CONTA DE ENERGIA CPFL;;-187,45;812,55`
  const { transacoes } = lerExtrato(csv)
  assert.deepEqual(
    transacoes.map(t => [t.tipo, t.valor, t.categoria]),
    [['receita', 1000, 'Outros'], ['despesa', 187.45, 'Contas']]
  )
})

test('avisa quando o arquivo não é um extrato', () => {
  assert.ok(lerExtrato('').erro)
  assert.ok(lerExtrato('nome,idade\nAna,30').erro)
})

test('API: prévia marca duplicadas e importação não repete transações', async () => {
  const app = criarApp(criarRepositorio(abrirBanco(':memory:')))
  const servidor = await new Promise(ok => { const s = app.listen(0, () => ok(s)) })
  const base = `http://localhost:${servidor.address().port}/api`
  const post = (caminho, corpo) => fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

  try {
    const previa = await (await post('/importacao/previa', { conteudo: OFX })).json()
    assert.equal(previa.transacoes.length, 3)
    assert.ok(previa.transacoes.every(t => !t.duplicada))

    const r1 = await (await post('/importacao', { transacoes: previa.transacoes })).json()
    assert.deepEqual(r1, { importadas: 3, ignoradas: 0 })

    const previa2 = await (await post('/importacao/previa', { conteudo: OFX })).json()
    assert.ok(previa2.transacoes.every(t => t.duplicada))

    const r2 = await (await post('/importacao', { transacoes: previa2.transacoes })).json()
    assert.deepEqual(r2, { importadas: 0, ignoradas: 3 })

    const ruim = await post('/importacao', { transacoes: [{ ...previa.transacoes[0], categoria: 'Inventada' }] })
    assert.equal(ruim.status, 400)
  } finally {
    servidor.closeAllConnections()
    servidor.close()
  }
})
