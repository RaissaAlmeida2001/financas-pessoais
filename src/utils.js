const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

export const formatarMoeda = v => moeda.format(v)
export const formatarMoedaCompacta = v => moedaCompacta.format(v)

export function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nomeMes(mes, formato = 'long') {
  const [a, m] = mes.split('-').map(Number)
  const opcoes = formato === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' }
  const texto = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', opcoes).replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1) // "Outubro de 2026"
}

export function formatarData(data) {
  const [a, m, d] = data.split('-')
  return `${d}/${m}/${a}`
}

// Hoje, se estiver no mês escolhido; senão, dia 1 do mês escolhido
export function dataPadrao(mes) {
  const hoje = new Date()
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  return iso.startsWith(mes) ? iso : `${mes}-01`
}

// "Escala bonita" pro eixo Y: arredonda o máximo pra 1, 2, 2.5 ou 5 × 10^n
export function escalaY(maximo, divisoes = 4) {
  if (maximo <= 0) return { topo: 100, passos: [0, 25, 50, 75, 100] }
  const bruto = maximo / divisoes
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map(f => f * potencia).find(p => p >= bruto)
  const topo = passo * Math.ceil(maximo / passo)
  const passos = []
  for (let v = 0; v <= topo + 1e-9; v += passo) passos.push(v)
  return { topo, passos }
}
