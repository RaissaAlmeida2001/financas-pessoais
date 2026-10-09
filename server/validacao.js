import { CATEGORIAS } from './db.js'

export const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
  const d = new Date(`${texto}T00:00:00Z`)
  // rejeita datas que "transbordam", tipo 2026-02-31
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto
}

// Devolve { dados, erros }. `dados` vem normalizado (texto aparado, valor numérico).
export function validarTransacao(corpo) {
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
  if (!erros.tipo && !CATEGORIAS[tipo].includes(categoria)) erros.categoria = 'Escolha uma categoria válida.'

  if (!dataValida(entrada.data)) erros.data = 'Informe uma data válida.'

  return {
    erros,
    dados: { tipo, descricao, valor, categoria, data: entrada.data },
  }
}
