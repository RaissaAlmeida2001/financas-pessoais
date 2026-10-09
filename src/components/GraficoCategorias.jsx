import { useState } from 'react'
import { formatarMoeda } from '../utils.js'

// Barras horizontais: despesas por categoria. Uma série só → uma cor só (o comprimento já mostra o tamanho).
export default function GraficoCategorias({ dados }) {
  const [ativo, setAtivo] = useState(null)
  const total = dados.reduce((s, d) => s + d.total, 0)
  const maximo = Math.max(...dados.map(d => d.total), 0)

  return (
    <section className="cartao" aria-labelledby="titulo-categorias">
      <div className="cartao-titulo">
        <h2 id="titulo-categorias">Despesas por categoria</h2>
        {total > 0 && <span>{formatarMoeda(total)}</span>}
      </div>

      {dados.length === 0 ? (
        <p className="vazio">Sem despesas neste mês.</p>
      ) : (
        <ul className={`barras-h ${ativo !== null ? 'com-hover' : ''}`} onPointerLeave={() => setAtivo(null)}>
          {dados.map((d, i) => {
            const pct = total ? Math.round((d.total / total) * 100) : 0
            return (
              <li
                key={d.categoria}
                className={`barra-h ${ativo === i ? 'ativa' : ''}`}
                tabIndex={0}
                aria-label={`${d.categoria}: ${formatarMoeda(d.total)}, ${pct}% das despesas`}
                onPointerEnter={() => setAtivo(i)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
              >
                <span className="barra-h-rotulo">{d.categoria}</span>
                <span className="barra-h-trilho" aria-hidden="true">
                  <span className="barra-h-preenche" style={{ width: `${(d.total / maximo) * 100}%` }} />
                </span>
                <span className="barra-h-valor">
                  {formatarMoeda(d.total)}
                  <small>{pct}%</small>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
