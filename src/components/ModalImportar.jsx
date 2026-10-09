import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { formatarData, formatarMoeda } from '../utils.js'

const TAMANHO_MAX = 5 * 1024 * 1024 // 5 MB

// Bancos brasileiros costumam gerar OFX/CSV em ISO-8859-1 (Windows-1252), não UTF-8.
// Tenta UTF-8 primeiro; se tiver byte inválido, cai pro Windows-1252.
async function lerTexto(arquivo) {
  const bytes = await arquivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export default function ModalImportar({ aberto, categorias, onFechar, onImportado }) {
  const dialogo = useRef(null)
  const inputArquivo = useRef(null)
  const [etapa, setEtapa] = useState('arquivo') // 'arquivo' | 'previa'
  const [arrastando, setArrastando] = useState(false)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [previa, setPrevia] = useState(null)
  const [itens, setItens] = useState([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    const d = dialogo.current
    if (aberto && !d.open) {
      setEtapa('arquivo')
      setPrevia(null)
      setItens([])
      setErro('')
      d.showModal()
    } else if (!aberto && d.open) d.close()
  }, [aberto])

  async function processar(arquivo) {
    if (!arquivo) return
    setErro('')
    if (arquivo.size > TAMANHO_MAX) return setErro('Arquivo grande demais (máximo 5 MB).')
    setOcupado(true)
    try {
      const conteudo = await lerTexto(arquivo)
      const resultado = await api.previaImportacao(conteudo)
      setNomeArquivo(arquivo.name)
      setPrevia(resultado)
      // já vem marcado tudo que ainda não foi importado
      setItens(resultado.transacoes.map(t => ({ ...t, marcada: !t.duplicada })))
      setEtapa('previa')
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
      if (inputArquivo.current) inputArquivo.current.value = ''
    }
  }

  const atualizar = (i, campos) => setItens(lista => lista.map((t, j) => (j === i ? { ...t, ...campos } : t)))
  const marcadas = itens.filter(t => t.marcada)
  const novas = itens.filter(t => !t.duplicada)
  const todasMarcadas = novas.length > 0 && novas.every(t => t.marcada)

  async function importar() {
    setOcupado(true)
    setErro('')
    try {
      const enviar = marcadas.map(({ marcada, duplicada, ...t }) => t)
      const resultado = await api.importar(enviar)
      const maisRecente = enviar.reduce((m, t) => (t.data > m ? t.data : m), '')
      onImportado(resultado, maisRecente.slice(0, 7))
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const receitas = marcadas.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)
  const despesas = marcadas.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0)

  return (
    <dialog ref={dialogo} className="modal" onClose={onFechar} aria-labelledby="titulo-importar">
      <div className="modal-conteudo">
        <div className="modal-topo">
          <h2 id="titulo-importar">{etapa === 'arquivo' ? 'Importar extrato bancário' : 'Revise antes de importar'}</h2>
          <button className="botao botao-texto" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-corpo">
          {etapa === 'arquivo' ? (
            <>
              <label
                className={`zona-arquivo ${arrastando ? 'arrastando' : ''}`}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); processar(e.dataTransfer.files[0]) }}
              >
                <strong>{ocupado ? 'Lendo o extrato…' : 'Arraste o arquivo aqui ou clique para escolher'}</strong>
                <span>Formatos aceitos: OFX e CSV</span>
                <input ref={inputArquivo} type="file" accept=".ofx,.csv,.txt,.qfx" className="sr-only"
                  onChange={e => processar(e.target.files[0])} disabled={ocupado} />
              </label>

              <details className="dica-bancos">
                <summary>Como baixar o extrato do meu banco?</summary>
                <ul>
                  <li><b>Nubank:</b> no app, Conta → Extrato → ícone de compartilhar → exportar (CSV ou OFX). Para o cartão, envie a fatura em CSV.</li>
                  <li><b>Itaú, Bradesco, Santander, BB, Caixa:</b> no internet banking, Extrato → Exportar/Salvar como <b>OFX</b> (às vezes chamado "Money" ou "Quicken").</li>
                  <li><b>Inter, C6, PicPay, Mercado Pago:</b> procure "Exportar extrato" e escolha OFX ou CSV.</li>
                </ul>
              </details>
              <p className="aviso-privacidade">🔒 O arquivo é lido só no seu computador e nada é salvo até você confirmar.</p>
            </>
          ) : (
            <>
              <p className="resumo-importacao">
                <span><b>{previa.transacoes.length}</b> transações em <b>{nomeArquivo}</b> ({previa.formato})</span>
                {previa.transacoes.length - novas.length > 0 && <span><b>{previa.transacoes.length - novas.length}</b> já importadas antes (desmarcadas)</span>}
                {previa.total > previa.transacoes.length && <span>Mostrando as primeiras {previa.transacoes.length}</span>}
              </p>
              <div className="tabela-wrap">
                <table className="tabela-importacao">
                  <thead>
                    <tr>
                      <th>
                        <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas}
                          onChange={e => setItens(l => l.map(t => (t.duplicada ? t : { ...t, marcada: e.target.checked })))} />
                      </th>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((t, i) => (
                      <tr key={t.idExterno} className={t.marcada ? undefined : 'desmarcada'}>
                        <td>
                          <input type="checkbox" checked={t.marcada} aria-label={`Importar ${t.descricao}`}
                            onChange={e => atualizar(i, { marcada: e.target.checked })} />
                        </td>
                        <td>{formatarData(t.data)}</td>
                        <td className="descricao-import" title={t.descricao}>
                          {t.descricao}
                          {t.duplicada && <span className="etiqueta etiqueta-dup">já importada</span>}
                        </td>
                        <td>
                          <select value={t.categoria} aria-label={`Categoria de ${t.descricao}`}
                            onChange={e => atualizar(i, { categoria: e.target.value })}>
                            {(categorias?.[t.tipo] ?? []).map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className={`num valor-${t.tipo}`}>{t.tipo === 'receita' ? '+ ' : '− '}{formatarMoeda(t.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {erro && <p className="form-erro-geral" role="alert" style={{ marginTop: 12 }}>{erro}</p>}
        </div>

        {etapa === 'previa' && (
          <div className="modal-rodape">
            <span className="resumo-importacao" style={{ margin: 0 }}>
              <span>Receitas <b>{formatarMoeda(receitas)}</b></span>
              <span>Despesas <b>{formatarMoeda(despesas)}</b></span>
            </span>
            <div className="form-acoes">
              <button className="botao" onClick={() => setEtapa('arquivo')} disabled={ocupado}>Outro arquivo</button>
              <button className="botao botao-primario" onClick={importar} disabled={ocupado || marcadas.length === 0}>
                {ocupado ? 'Importando…' : `Importar ${marcadas.length} ${marcadas.length === 1 ? 'transação' : 'transações'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
