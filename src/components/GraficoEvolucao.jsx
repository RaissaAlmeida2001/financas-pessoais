import { useCallback, useRef, useState } from 'react'
import { escalaY, formatarMoeda, formatarMoedaCompacta, nomeMes } from '../utils.js'

const SERIES = [
  { chave: 'receitas', nome: 'Receitas', cor: 'var(--serie-receita)' },
  { chave: 'despesas', nome: 'Despesas', cor: 'var(--serie-despesa)' },
]
const ALTURA = 240
const MARGEM = { topo: 12, direita: 8, base: 26, esquerda: 56 }

// Retângulo com só os cantos de cima arredondados (a base fica "presa" no eixo)
function barra(x, y, largura, altura, raio = 4) {
  const r = Math.min(raio, largura / 2, altura)
  return `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + altura} Z`
}

// Mede a largura real do contêiner pra desenhar o SVG em pixels de verdade
// (assim o texto não encolhe no celular)
function useLargura() {
  const observador = useRef(null)
  const [largura, setLargura] = useState(0)
  // ref de callback: funciona mesmo quando o gráfico some e volta (botão "ver tabela")
  const ref = useCallback(elemento => {
    observador.current?.disconnect()
    if (!elemento) return
    observador.current = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)))
    observador.current.observe(elemento)
  }, [])
  return [ref, largura]
}

export default function GraficoEvolucao({ dados, mesSelecionado }) {
  const [ref, largura] = useLargura()
  const [ativo, setAtivo] = useState(null)
  const [verTabela, setVerTabela] = useState(false)

  const maximo = Math.max(...dados.flatMap(d => [d.receitas, d.despesas]), 0)
  const { topo, passos } = escalaY(maximo)
  const areaL = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 0)
  const areaA = ALTURA - MARGEM.topo - MARGEM.base
  const coluna = dados.length ? areaL / dados.length : 0
  const larguraBarra = Math.max(Math.min((coluna * 0.62 - 2) / 2, 28), 4)
  const y = v => MARGEM.topo + areaA - (v / topo) * areaA
  const semDados = maximo === 0

  const d = ativo !== null ? dados[ativo] : null
  const tooltipX = ativo !== null ? MARGEM.esquerda + coluna * ativo + coluna / 2 : 0
  const tooltipY = d ? y(Math.max(d.receitas, d.despesas)) : 0

  return (
    <section className="cartao" aria-labelledby="titulo-evolucao">
      <div className="cartao-titulo">
        <h2 id="titulo-evolucao">Receitas x despesas · últimos 6 meses</h2>
        <button className="botao botao-texto" onClick={() => setVerTabela(v => !v)} aria-pressed={verTabela}>
          {verTabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      <div className="legenda">
        {SERIES.map(s => <span key={s.chave}><i style={{ background: s.cor }} aria-hidden="true" />{s.nome}</span>)}
      </div>

      {verTabela ? (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr><th>Mês</th><th className="num">Receitas</th><th className="num">Despesas</th><th className="num">Saldo</th></tr>
            </thead>
            <tbody>
              {dados.map(m => (
                <tr key={m.mes}>
                  <td>{nomeMes(m.mes)}</td>
                  <td className="num">{formatarMoeda(m.receitas)}</td>
                  <td className="num">{formatarMoeda(m.despesas)}</td>
                  <td className="num">{formatarMoeda(m.receitas - m.despesas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className={`grafico ${ativo !== null ? 'com-hover' : ''}`} onPointerLeave={() => setAtivo(null)}>
          {largura > 0 && (
            <svg width={largura} height={ALTURA} role="img"
              aria-label="Gráfico de barras com receitas e despesas dos últimos 6 meses. Use Tab pra percorrer os meses ou veja a tabela.">
              {passos.map(p => (
                <g key={p}>
                  <line className={p === 0 ? 'linha-base' : 'linha-grade'} x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(p)} y2={y(p)} />
                  <text x={MARGEM.esquerda - 8} y={y(p)} dy="0.32em" textAnchor="end">{formatarMoedaCompacta(p)}</text>
                </g>
              ))}

              {dados.map((m, i) => {
                const x0 = MARGEM.esquerda + coluna * i
                const centro = x0 + coluna / 2
                return (
                  <g key={m.mes}>
                    {ativo === i && <rect className="faixa-hover" x={x0 + 2} y={MARGEM.topo} width={coluna - 4} height={areaA} rx="4" />}
                    {SERIES.map((s, j) => {
                      const v = m[s.chave]
                      if (v <= 0) return null
                      // 2px de respiro entre as duas barras do mesmo mês
                      const x = j === 0 ? centro - larguraBarra - 1 : centro + 1
                      return <path key={s.chave} className={`marca ${ativo === i ? 'ativa' : ''}`} d={barra(x, y(v), larguraBarra, y(0) - y(v))} fill={s.cor} />
                    })}
                    <text x={centro} y={ALTURA - 6} textAnchor="middle"
                      style={m.mes === mesSelecionado ? { fill: 'var(--texto)', fontWeight: 600 } : undefined}>
                      {nomeMes(m.mes, 'short')}
                    </text>
                    {/* alvo de hover/foco: a coluna inteira, maior que as barras */}
                    <rect className="alvo" x={x0} y={MARGEM.topo} width={coluna} height={areaA + MARGEM.base}
                      tabIndex={0}
                      aria-label={`${nomeMes(m.mes)}: receitas ${formatarMoeda(m.receitas)}, despesas ${formatarMoeda(m.despesas)}`}
                      onPointerEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)} />
                  </g>
                )
              })}
            </svg>
          )}

          {semDados && largura > 0 && <p className="vazio" style={{ position: 'absolute', inset: '40% 0 auto' }}>Sem lançamentos nesse período.</p>}

          {d && (
            <div className="tooltip" role="status" style={{ left: Math.min(Math.max(tooltipX, 85), largura - 85), top: Math.max(tooltipY, 40) }}>
              <p className="tooltip-titulo">{nomeMes(d.mes)}</p>
              {SERIES.map(s => (
                <p key={s.chave} className="tooltip-linha">
                  <i className="tooltip-chave" style={{ background: s.cor }} aria-hidden="true" />
                  <b>{formatarMoeda(d[s.chave])}</b> <small>{s.nome}</small>
                </p>
              ))}
              <p className="tooltip-linha"><b>{formatarMoeda(d.receitas - d.despesas)}</b> <small>Saldo</small></p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
