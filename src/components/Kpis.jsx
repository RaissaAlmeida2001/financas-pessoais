import { formatarMoeda } from '../utils.js'

export default function Kpis({ resumo }) {
  const { receitas = 0, despesas = 0, saldo = 0 } = resumo ?? {}
  const positivo = saldo >= 0
  // enquanto o primeiro resumo não chega, mostra "—" em vez de um R$ 0,00 enganoso
  const valor = v => (resumo ? formatarMoeda(v) : '—')

  return (
    <section className="kpis" aria-label="Resumo do mês">
      <article className="cartao">
        <p className="kpi-rotulo"><i className="kpi-marca" style={{ background: 'var(--serie-receita)' }} aria-hidden="true" />Receitas</p>
        <p className="kpi-valor">{valor(receitas)}</p>
      </article>
      <article className="cartao">
        <p className="kpi-rotulo"><i className="kpi-marca" style={{ background: 'var(--serie-despesa)' }} aria-hidden="true" />Despesas</p>
        <p className="kpi-valor">{valor(despesas)}</p>
      </article>
      <article className="cartao">
        <p className="kpi-rotulo">Saldo do mês</p>
        <p className="kpi-valor">{valor(saldo)}</p>
        {(receitas > 0 || despesas > 0) && (
          <p className={`kpi-status ${positivo ? 'positivo' : 'negativo'}`}>
            <span aria-hidden="true">{positivo ? '▲' : '▼'}</span>{' '}
            {positivo ? 'Saldo positivo' : 'Saldo negativo'}
            {receitas > 0 && ` · ${Math.round((despesas / receitas) * 100)}% da receita gasta`}
          </p>
        )}
      </article>
    </section>
  )
}
