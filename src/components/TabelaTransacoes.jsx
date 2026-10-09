import { useState } from 'react'
import { formatarData, formatarMoeda } from '../utils.js'

const FILTROS = [
  ['todas', 'Todas'],
  ['receita', 'Receitas'],
  ['despesa', 'Despesas'],
]

export default function TabelaTransacoes({ transacoes, onEditar, onRemover }) {
  const [filtro, setFiltro] = useState('todas')
  const visiveis = filtro === 'todas' ? transacoes : transacoes.filter(t => t.tipo === filtro)

  return (
    <section className="cartao" aria-labelledby="titulo-tabela">
      <div className="cartao-titulo">
        <h2 id="titulo-tabela">Transações</h2>
        <div className="filtros-tabela" role="group" aria-label="Filtrar transações">
          {FILTROS.map(([valor, rotulo]) => (
            <button key={valor} className="botao botao-texto" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="vazio">Nenhuma transação neste mês ainda.</p>
      ) : (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th className="num">Valor</th>
                <th><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(t => (
                <tr key={t.id}>
                  <td>{formatarData(t.data)}</td>
                  <td>{t.descricao}</td>
                  <td><span className="etiqueta">{t.categoria}</span></td>
                  <td className={`num valor-${t.tipo}`}>
                    {t.tipo === 'receita' ? '+ ' : '− '}{formatarMoeda(t.valor)}
                  </td>
                  <td>
                    <div className="acoes-linha">
                      <button className="botao botao-texto" onClick={() => onEditar(t)} aria-label={`Editar ${t.descricao}`}>Editar</button>
                      <button className="botao botao-texto" onClick={() => onRemover(t)} aria-label={`Excluir ${t.descricao}`}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
