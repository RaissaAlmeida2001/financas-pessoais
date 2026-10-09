import { useState } from 'react'
import { formatarMoeda, varCor } from '../utils.js'

// Barras horizontais: despesas por categoria, cada uma com a cor da sua categoria.
// O nome e o valor ficam sempre escritos ao lado, então a cor nunca é a única pista.
export default function GraficoCategorias({ dados, cores = {} }) {
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
                <span className="barra-h-rotulo etiqueta-cat">
                  <i className="ponto-cor" style={{ background: varCor(cores[`despesa:${d.categoria}`]) }} aria-hidden="true" />
                  {d.categoria}
                </span>
                <span className="barra-h-trilho" aria-hidden="true">
                  <span className="barra-h-preenche" style={{ width: `${(d.total / maximo) * 100}%`, background: varCor(cores[`despesa:${d.categoria}`]) }} />
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
