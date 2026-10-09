// Leitura de extratos bancários (OFX e CSV) e categorização automática.
// Tudo roda localmente: o arquivo nunca sai do seu computador.
import { createHash } from 'node:crypto'

// ——— utilidades ———

// "1.234,56" | "-1234.56" | "R$ -12,30" | "(12,30)" | "12,30-" -> número
export function lerValor(texto) {
  if (typeof texto === 'number') return texto
  let s = String(texto ?? '').trim().replace(/R\$|\s/gi, '')
  if (!s) return NaN
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  // se tem vírgula depois do último ponto, a vírgula é o decimal (padrão BR)
  if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (negativo ? -n : n) : NaN
}

// "31/12/2026" | "31/12/26" | "2026-12-31" | "20261231..." (OFX) -> "2026-12-31"
export function lerData(texto) {
  const s = String(texto ?? '').trim()
  let a, m, d
  let r
  if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [, a, m, d] = r
  else if ((r = s.match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/))) {
    [, d, m, a] = r
    if (a.length === 2) a = `20${a}`
  } else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})/))) [, a, m, d] = r
  else return null
  const iso = `${a}-${m}-${d}`
  const data = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === iso ? iso : null
}

const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Identificador estável pra detectar transação já importada
const hash = texto => createHash('sha1').update(texto).digest('hex').slice(0, 16)

export function idExterno(t, fitid) {
  if (fitid) return `ofx:${hash(fitid)}`
  return `hash:${hash(`${t.data}|${t.tipo}|${t.valor.toFixed(2)}|${semAcento(t.descricao).replace(/\s+/g, ' ').trim()}`)}`
}

// Duas compras iguais no mesmo dia (ex.: dois cafés) geram o mesmo hash;
// numera as repetições pra nenhuma ser descartada como duplicada
function numerarRepetidas(transacoes) {
  const vistos = new Map()
  for (const t of transacoes) {
    const n = (vistos.get(t.idExterno) ?? 0) + 1
    vistos.set(t.idExterno, n)
    if (n > 1) t.idExterno = `${t.idExterno}:${n}`
  }
  return transacoes
}

// ——— categorização por palavras-chave ———
// As regras vêm do banco (cada categoria tem suas palavras-chave).

// Palavra curta (até 4 letras, ex.: "tim", "bar") precisa ser palavra inteira;
// palavra maior pode ser começo de palavra ("supermerc" pega "supermercado").
function casa(texto, palavra) {
  const p = semAcento(palavra).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const fim = palavra.length <= 4 ? '(?![a-z0-9])' : ''
  return new RegExp(`(^|[^a-z0-9])${p}${fim}`).test(texto)
}

export function categorizar(descricao, tipo, regras = []) {
  const texto = semAcento(descricao)
  const achadas = []
  for (const r of regras) {
    if (r.tipo !== tipo) continue
    for (const p of r.palavras) if (casa(texto, p)) achadas.push({ nome: r.nome, palavra: semAcento(p) })
  }
  // se uma palavra achada está dentro de outra também achada ("mercado" em "mercadolivre"),
  // vale a mais específica; entre as restantes, vale a ordem das categorias
  const especificas = achadas.filter(a => !achadas.some(b => b.palavra !== a.palavra && b.palavra.includes(a.palavra)))
  return especificas[0]?.nome ?? 'Outros'
}

function montar(data, descricao, valorComSinal, fitid, regras) {
  if (!data || !Number.isFinite(valorComSinal) || valorComSinal === 0) return null
  const tipo = valorComSinal > 0 ? 'receita' : 'despesa'
  const desc = (descricao || 'Sem descrição').replace(/\s+/g, ' ').trim().slice(0, 120)
  const t = { data, descricao: desc, valor: Math.round(Math.abs(valorComSinal) * 100) / 100, tipo }
  t.categoria = categorizar(desc, tipo, regras)
  t.idExterno = idExterno(t, fitid)
  return t
}

// ——— OFX (padrão da maioria dos bancos brasileiros) ———

export function lerOFX(texto, regras) {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  const campo = (bloco, tag) => bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim()
  return blocos
    .map(b => {
      const memo = campo(b, 'MEMO')
      const nome = campo(b, 'NAME')
      const descricao = memo && nome && !memo.includes(nome) ? `${nome} ${memo}` : memo || nome
      return montar(lerData(campo(b, 'DTPOSTED')), descricao, lerValor(campo(b, 'TRNAMT')), campo(b, 'FITID'), regras)
    })
    .filter(Boolean)
}

// ——— CSV (Nubank, Inter, C6 e exportações genéricas) ———

function separarLinhaCSV(linha, sep) {
  const campos = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++ }
      else aspas = !aspas
    } else if (c === sep && !aspas) {
      campos.push(atual)
      atual = ''
    } else atual += c
  }
  campos.push(atual)
  return campos.map(c => c.trim())
}

const COLUNAS = {
  data: ['data', 'date', 'data lancamento', 'data do lancamento', 'data movimento', 'dt'],
  descricao: ['descricao', 'description', 'title', 'historico', 'lancamento', 'memo', 'detalhes', 'estabelecimento'],
  valor: ['valor', 'amount', 'value', 'valor (r$)', 'valor r$', 'quantia'],
  credito: ['credito', 'entrada', 'entradas'],
  debito: ['debito', 'saida', 'saidas'],
}

function acharColuna(cabecalho, nomes) {
  const limpo = cabecalho.map(h => semAcento(h).replace(/[^a-z0-9$() ]/g, '').trim())
  let i = limpo.findIndex(h => nomes.includes(h))
  if (i === -1) i = limpo.findIndex(h => nomes.some(n => h.startsWith(n)))
  return i
}

export function lerCSV(texto, regras) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  if (linhas.length < 2) return { transacoes: [], erro: 'O arquivo está vazio.' }

  // procura a linha de cabeçalho (alguns bancos colocam informações antes)
  const sep = (linhas.slice(0, 10).join('\n').match(/;/g)?.length ?? 0) > (linhas.slice(0, 10).join('\n').match(/,/g)?.length ?? 0) / 2 ? ';' : ','
  let inicio = -1
  let col
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cab = separarLinhaCSV(linhas[i], sep)
    col = Object.fromEntries(Object.entries(COLUNAS).map(([k, nomes]) => [k, acharColuna(cab, nomes)]))
    if (col.data !== -1 && (col.valor !== -1 || col.credito !== -1 || col.debito !== -1)) { inicio = i; break }
  }
  if (inicio === -1) {
    return { transacoes: [], erro: 'Não encontrei as colunas de data e valor. O CSV precisa ter um cabeçalho com "Data" e "Valor".' }
  }

  // Fatura de cartão do Nubank (date,title,amount): valor positivo = compra
  const cabecalho = separarLinhaCSV(linhas[inicio], sep).map(semAcento)
  const faturaCartao = cabecalho.includes('title') && cabecalho.includes('amount')

  const transacoes = linhas.slice(inicio + 1).map(linha => {
    const c = separarLinhaCSV(linha, sep)
    let valor
    if (col.valor !== -1) valor = lerValor(c[col.valor])
    else valor = (lerValor(c[col.credito]) || 0) - Math.abs(lerValor(c[col.debito]) || 0)
    if (faturaCartao) valor = -valor
    return montar(lerData(c[col.data]), col.descricao !== -1 ? c[col.descricao] : '', valor, undefined, regras)
  }).filter(Boolean)

  return { transacoes }
}

export function lerExtrato(conteudo, regras = []) {
  if (typeof conteudo !== 'string' || !conteudo.trim()) return { erro: 'Arquivo vazio.' }
  if (/<OFX>|OFXHEADER/i.test(conteudo)) {
    const transacoes = numerarRepetidas(lerOFX(conteudo, regras))
    return transacoes.length ? { formato: 'OFX', transacoes } : { erro: 'Não encontrei transações nesse OFX.' }
  }
  const { transacoes, erro } = lerCSV(conteudo, regras)
  if (erro) return { erro }
  numerarRepetidas(transacoes)
  return transacoes.length ? { formato: 'CSV', transacoes } : { erro: 'Não encontrei transações válidas nesse CSV.' }
}

