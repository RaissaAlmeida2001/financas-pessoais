import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

const VAZIO = { nome: '', palavras: '' }

// Linha em modo edição (nome + palavras-chave)
function EditorCategoria({ inicial, fixa, rotuloSalvar, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await onSalvar({ nome: form.nome, palavrasChave: form.palavras })
      setErros({})
      if (!onCancelar) setForm(VAZIO) // formulário de "nova categoria" limpa depois de salvar
    } catch (erro) {
      setErros(erro.campos ?? { geral: erro.message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="editor-categoria" onSubmit={enviar} noValidate>
      <div className="campo">
        <label htmlFor={`nome-${rotuloSalvar}`}>Nome</label>
        <input id={`nome-${rotuloSalvar}`} value={form.nome} maxLength={30} disabled={fixa} placeholder="Ex.: Pets"
          aria-invalid={erros.nome ? 'true' : undefined} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        {erros.nome && <p className="campo-erro">{erros.nome}</p>}
      </div>
      <div className="campo">
        <label htmlFor={`palavras-${rotuloSalvar}`}>Palavras-chave <small>(separe por vírgula)</small></label>
        <input id={`palavras-${rotuloSalvar}`} value={form.palavras} placeholder="Ex.: petz, cobasi, veterinário"
          aria-invalid={erros.palavrasChave ? 'true' : undefined} onChange={e => setForm(f => ({ ...f, palavras: e.target.value }))} />
        {erros.palavrasChave && <p className="campo-erro">{erros.palavrasChave}</p>}
      </div>
      {erros.geral && <p className="campo-erro">{erros.geral}</p>}
      <div className="form-acoes">
        <button className="botao botao-primario" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : rotuloSalvar}</button>
        {onCancelar && <button className="botao" type="button" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  )
}

export default function ModalCategorias({ aberto, tipoInicial = 'despesa', onFechar, onAlterado }) {
  const dialogo = useRef(null)
  const [tipo, setTipo] = useState(tipoInicial)
  const [lista, setLista] = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [erro, setErro] = useState('')

  async function carregar() {
    try {
      setLista(await api.categoriasDetalhes())
    } catch (e) {
      setErro(e.message)
    }
  }

  useEffect(() => {
    const d = dialogo.current
    if (aberto && !d.open) {
      setTipo(tipoInicial)
      setEditandoId(null)
      setErro('')
      carregar()
      d.showModal()
    } else if (!aberto && d.open) d.close()
  }, [aberto, tipoInicial])

  async function depoisDeAlterar() {
    await carregar()
    onAlterado()
  }

  async function criar(dados) {
    await api.criarCategoria({ ...dados, tipo })
    await depoisDeAlterar()
  }

  async function salvar(c, dados) {
    await api.atualizarCategoria(c.id, dados)
    setEditandoId(null)
    await depoisDeAlterar()
  }

  async function excluir(c) {
    const aviso = c.uso
      ? `Excluir "${c.nome}"? ${c.uso} ${c.uso === 1 ? 'transação vai' : 'transações vão'} para "Outros".`
      : `Excluir "${c.nome}"?`
    if (!window.confirm(aviso)) return
    try {
      await api.removerCategoria(c.id)
      await depoisDeAlterar()
    } catch (e) {
      setErro(e.message)
    }
  }

  const visiveis = lista.filter(c => c.tipo === tipo)

  return (
    <dialog ref={dialogo} className="modal modal-estreito" onClose={onFechar} aria-labelledby="titulo-categorias-modal">
      <div className="modal-conteudo">
        <div className="modal-topo">
          <h2 id="titulo-categorias-modal">Categorias</h2>
          <button className="botao botao-texto" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-corpo">
          <div className="alternador" role="group" aria-label="Tipo de categoria" style={{ marginBottom: 16 }}>
            {['despesa', 'receita'].map(t => (
              <button key={t} type="button" aria-pressed={tipo === t} onClick={() => { setTipo(t); setEditandoId(null) }}>
                {t === 'despesa' ? 'Despesas' : 'Receitas'}
              </button>
            ))}
          </div>

          <section className="nova-categoria" aria-label="Nova categoria">
            <h3>Nova categoria de {tipo}</h3>
            <EditorCategoria key={tipo} inicial={VAZIO} rotuloSalvar="Adicionar" onSalvar={criar} />
          </section>

          {erro && <p className="form-erro-geral" role="alert">{erro}</p>}

          <ul className="lista-categorias">
            {visiveis.map(c => (
              <li key={c.id}>
                {editandoId === c.id ? (
                  <EditorCategoria
                    inicial={{ nome: c.nome, palavras: c.palavrasChave.join(', ') }}
                    fixa={c.fixa}
                    rotuloSalvar="Salvar"
                    onSalvar={dados => salvar(c, dados)}
                    onCancelar={() => setEditandoId(null)}
                  />
                ) : (
                  <div className="linha-categoria">
                    <div className="linha-categoria-info">
                      <strong>{c.nome}</strong>
                      <small>
                        {c.uso} {c.uso === 1 ? 'transação' : 'transações'}
                        {c.fixa && ' · padrão para o que não tem categoria'}
                      </small>
                      {c.palavrasChave.length > 0 && (
                        <span className="palavras">
                          {c.palavrasChave.slice(0, 6).map(p => <span key={p} className="etiqueta">{p}</span>)}
                          {c.palavrasChave.length > 6 && <span className="etiqueta">+{c.palavrasChave.length - 6}</span>}
                        </span>
                      )}
                    </div>
                    <div className="acoes-linha">
                      <button className="botao botao-texto" onClick={() => setEditandoId(c.id)} aria-label={`Editar ${c.nome}`}>Editar</button>
                      {!c.fixa && <button className="botao botao-texto" onClick={() => excluir(c)} aria-label={`Excluir ${c.nome}`}>Excluir</button>}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </dialog>
  )
}
