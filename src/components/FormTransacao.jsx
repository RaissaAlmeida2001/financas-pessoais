import { useEffect, useState } from 'react'
import { dataPadrao } from '../utils.js'

const vazio = mes => ({ tipo: 'despesa', descricao: '', valor: '', categoria: '', data: dataPadrao(mes) })

// Formulário de criar/editar. Quando `editando` tem uma transação, entra no modo edição.
export default function FormTransacao({ categorias, mes, editando, onSalvar, onCancelar, onGerenciarCategorias }) {
  const [form, setForm] = useState(() => vazio(mes))
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setErros({})
    setErroGeral('')
    setForm(editando ? { ...editando, valor: editando.valor.toFixed(2).replace('.', ',') } : vazio(mes))
  }, [editando, mes])

  const opcoes = categorias?.[form.tipo] ?? []

  function mudar(campo, valor) {
    setForm(f => {
      const novo = { ...f, [campo]: valor }
      // ao trocar receita/despesa, a categoria anterior pode não existir mais
      if (campo === 'tipo' && !categorias?.[valor]?.includes(f.categoria)) novo.categoria = ''
      return novo
    })
    setErros(e => ({ ...e, [campo]: undefined }))
  }

  async function enviar(e) {
    e.preventDefault()
    setSalvando(true)
    setErroGeral('')
    try {
      // "1.234,56" -> "1234.56" (com vírgula, o ponto é separador de milhar); "10.50" fica como está
      const valor = form.valor.includes(',') ? form.valor.replace(/\./g, '').replace(',', '.') : form.valor
      await onSalvar({ ...form, valor })
      if (!editando) setForm(f => ({ ...vazio(mes), tipo: f.tipo, data: f.data }))
    } catch (erro) {
      if (erro.campos) setErros(erro.campos)
      else setErroGeral(erro.message)
    } finally {
      setSalvando(false)
    }
  }

  const props = campo => ({
    id: `campo-${campo}`,
    'aria-invalid': erros[campo] ? 'true' : undefined,
    'aria-describedby': erros[campo] ? `erro-${campo}` : undefined,
  })
  const Erro = ({ campo }) => (erros[campo] ? <p className="campo-erro" id={`erro-${campo}`}>{erros[campo]}</p> : null)

  return (
    <section className="cartao" aria-labelledby="titulo-form">
      <div className="cartao-titulo">
        <h2 id="titulo-form">{editando ? 'Editar transação' : 'Nova transação'}</h2>
      </div>
      <form className="form" onSubmit={enviar} noValidate>
        <div className="alternador" role="group" aria-label="Tipo de transação">
          {['despesa', 'receita'].map(t => (
            <button key={t} type="button" aria-pressed={form.tipo === t} onClick={() => mudar('tipo', t)}>
              {t === 'despesa' ? 'Despesa' : 'Receita'}
            </button>
          ))}
        </div>

        <div className="campo">
          <label htmlFor="campo-descricao">Descrição</label>
          <input {...props('descricao')} value={form.descricao} maxLength={120} placeholder="Ex.: Mercado"
            onChange={e => mudar('descricao', e.target.value)} />
          <Erro campo="descricao" />
        </div>

        <div className="campos-linha">
          <div className="campo">
            <label htmlFor="campo-valor">Valor (R$)</label>
            <input {...props('valor')} value={form.valor} inputMode="decimal" placeholder="0,00"
              onChange={e => mudar('valor', e.target.value.replace(/[^\d,.]/g, ''))} />
            <Erro campo="valor" />
          </div>
          <div className="campo">
            <label htmlFor="campo-data">Data</label>
            <input {...props('data')} type="date" value={form.data} onChange={e => mudar('data', e.target.value)} />
            <Erro campo="data" />
          </div>
        </div>

        <div className="campo">
          <div className="rotulo-com-acao">
            <label htmlFor="campo-categoria">Categoria</label>
            <button type="button" className="botao botao-texto botao-mini" onClick={() => onGerenciarCategorias(form.tipo)}>
              + Nova categoria
            </button>
          </div>
          <select {...props('categoria')} value={form.categoria} onChange={e => mudar('categoria', e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Erro campo="categoria" />
        </div>

        {erroGeral && <p className="form-erro-geral" role="alert">{erroGeral}</p>}

        <div className="form-acoes">
          <button className="botao botao-primario" type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar'}
          </button>
          {editando && <button className="botao" type="button" onClick={onCancelar}>Cancelar</button>}
        </div>
      </form>
    </section>
  )
}
