import { CORES } from './db.js'

export const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
  const d = new Date(`${texto}T00:00:00Z`)
  // rejeita datas que "transbordam", tipo 2026-02-31
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto
}

// Devolve { dados, erros }. `dados` vem normalizado (texto aparado, valor numérico).
// `categorias` é o mapa { receita: [...], despesa: [...] } que está no banco.
export function validarTransacao(corpo, categorias) {
  const erros = {}
  const entrada = corpo ?? {}

  const tipo = entrada.tipo
  if (!['receita', 'despesa'].includes(tipo)) erros.tipo = 'Escolha receita ou despesa.'

  const descricao = typeof entrada.descricao === 'string' ? entrada.descricao.trim() : ''
  if (!descricao) erros.descricao = 'Informe uma descrição.'
  else if (descricao.length > 120) erros.descricao = 'Use no máximo 120 caracteres.'

  const valor = typeof entrada.valor === 'string' ? Number(entrada.valor.replace(',', '.')) : entrada.valor
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) erros.valor = 'Informe um valor maior que zero.'
  else if (valor > 10_000_000) erros.valor = 'Valor alto demais.'
  else if (Math.abs(Math.round(valor * 100) - valor * 100) > 1e-6) erros.valor = 'Use no máximo 2 casas decimais.'

  const categoria = entrada.categoria
  if (!erros.tipo && !categorias[tipo]?.includes(categoria)) erros.categoria = 'Escolha uma categoria válida.'

  if (!dataValida(entrada.data)) erros.data = 'Informe uma data válida.'

  return {
    erros,
    dados: { tipo, descricao, valor, categoria, data: entrada.data },
  }
}

// Nome: 1 a 30 caracteres. Palavras-chave: lista (ou texto separado por vírgula),
// até 50 palavras de 2 a 40 caracteres, sem repetir.
export function validarCategoria(corpo, { exigirTipo }) {
  const erros = {}
  const entrada = corpo ?? {}

  const tipo = entrada.tipo
  if (exigirTipo && !['receita', 'despesa'].includes(tipo)) erros.tipo = 'Escolha receita ou despesa.'

  const nome = typeof entrada.nome === 'string' ? entrada.nome.replace(/\s+/g, ' ').trim() : ''
  if (!nome) erros.nome = 'Informe um nome.'
  else if (nome.length > 30) erros.nome = 'Use no máximo 30 caracteres.'
  else if (!/[\p{L}\p{N}]/u.test(nome)) erros.nome = 'Use pelo menos uma letra ou número.'

  const bruto = entrada.palavrasChave ?? []
  const lista = Array.isArray(bruto) ? bruto : typeof bruto === 'string' ? bruto.split(',') : null
  let palavrasChave = []
  if (!lista || lista.some(p => typeof p !== 'string')) erros.palavrasChave = 'Palavras-chave inválidas.'
  else {
    palavrasChave = [...new Set(lista.map(p => p.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean))]
    if (palavrasChave.length > 50) erros.palavrasChave = 'Use no máximo 50 palavras-chave.'
    else if (palavrasChave.some(p => p.length < 2 || p.length > 40)) erros.palavrasChave = 'Cada palavra-chave precisa ter de 2 a 40 caracteres.'
  }

  const cor = entrada.cor ?? null
  if (cor !== null && !CORES.includes(cor)) erros.cor = 'Escolha uma das cores disponíveis.'

  return { erros, dados: { tipo, nome, palavrasChave, cor } }
}
