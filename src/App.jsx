import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import { mesAtual, nomeMes, somarMeses } from './utils.js'
import Kpis from './components/Kpis.jsx'
import FormTransacao from './components/FormTransacao.jsx'
import TabelaTransacoes from './components/TabelaTransacoes.jsx'
import GraficoCategorias from './components/GraficoCategorias.jsx'
import GraficoEvolucao from './components/GraficoEvolucao.jsx'
import ModalImportar from './components/ModalImportar.jsx'
import BotaoTema from './components/BotaoTema.jsx'
import ModalCategorias from './components/ModalCategorias.jsx'

export default function App() {
  const [mes, setMes] = useState(mesAtual)
  const [categorias, setCategorias] = useState(null)
  const [transacoes, setTransacoes] = useState([])
  const [resumo, setResumo] = useState(null)
  const [evolucao, setEvolucao] = useState([])
  const [editando, setEditando] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [importando, setImportando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [gerenciarCategorias, setGerenciarCategorias] = useState(null) // null | 'receita' | 'despesa'

  const [coresCategorias, setCoresCategorias] = useState({}) // "despesa:Lazer" -> "rosa"

  // nomes (pro formulário/validação) e cores (pros gráficos e tabela) vêm da mesma lista
  const carregarCategorias = useCallback(async () => {
    try {
      const lista = await api.categoriasDetalhes()
      const nomes = { receita: [], despesa: [] }
      const cores = {}
      for (const c of lista) {
        nomes[c.tipo].push(c.nome)
        cores[`${c.tipo}:${c.nome}`] = c.cor
      }
      setCategorias(nomes)
      setCoresCategorias(cores)
    } catch (e) {
      setErro(e.message)
    }
  }, [])
  useEffect(() => { carregarCategorias() }, [carregarCategorias])

  // Recarrega tudo que depende do mês. Os dados anteriores ficam na tela (mais claros)
  // enquanto os novos chegam, pra não "piscar" o layout.
  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [t, r, e] = await Promise.all([api.transacoes(mes), api.resumo(mes), api.evolucao(mes)])
      setTransacoes(t)
      setResumo(r)
      setEvolucao(e)
      setErro('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(dados) {
    if (editando) await api.atualizar(editando.id, dados)
    else await api.criar(dados)
    setEditando(null)
    // se a transação caiu em outro mês, vai pra ele; senão só recarrega
    const mesDaTransacao = dados.data.slice(0, 7)
    if (mesDaTransacao !== mes) setMes(mesDaTransacao)
    else await carregar()
  }

  async function remover(t) {
    if (!window.confirm(`Excluir "${t.descricao}"?`)) return
    try {
      await api.remover(t.id)
      if (editando?.id === t.id) setEditando(null)
      await carregar()
    } catch (e) {
      setErro(e.message)
    }
  }

  async function aposImportar({ importadas, ignoradas }, mesMaisRecente) {
    setImportando(false)
    setAviso(
      `${importadas} ${importadas === 1 ? 'transação importada' : 'transações importadas'}` +
        (ignoradas ? ` · ${ignoradas} já existiam e foram ignoradas` : '') + '.'
    )
    if (mesMaisRecente && mesMaisRecente !== mes) setMes(mesMaisRecente)
    else await carregar()
  }

  return (
    <div className="app">
      <header className="topo">
        <div>
          <h1>Finanças Pessoais</h1>
          <p>Controle de receitas e despesas</p>
        </div>
        <div className="topo-acoes">
          <nav className="seletor-mes" aria-label="Escolher mês">
            <button className="botao botao-icone" onClick={() => setMes(m => somarMeses(m, -1))} aria-label="Mês anterior">‹</button>
            <output aria-live="polite">{nomeMes(mes)}</output>
            <button className="botao botao-icone" onClick={() => setMes(m => somarMeses(m, 1))} aria-label="Próximo mês">›</button>
            {mes !== mesAtual() && <button className="botao botao-texto" onClick={() => setMes(mesAtual())}>Hoje</button>}
          </nav>
          <button className="botao botao-primario" onClick={() => { setAviso(''); setImportando(true) }}>Importar extrato</button>
          <button className="botao" onClick={() => setGerenciarCategorias('despesa')}>Categorias</button>
          <BotaoTema />
        </div>
      </header>

      {aviso && (
        <p className="aviso-sucesso" role="status">
          {aviso} <button className="botao botao-texto" onClick={() => setAviso('')} aria-label="Fechar aviso">✕</button>
        </p>
      )}

      {erro && <p className="aviso-erro" role="alert">{erro} Confira se a API está rodando (npm run dev).</p>}

      <main className={carregando && resumo ? 'carregando' : undefined}>
        <Kpis resumo={resumo} />

        <div className="grade-principal">
          <FormTransacao
            categorias={categorias}
            mes={mes}
            editando={editando}
            onSalvar={salvar}
            onCancelar={() => setEditando(null)}
            onGerenciarCategorias={setGerenciarCategorias}
          />
          <div className="coluna-graficos">
            <GraficoEvolucao dados={evolucao} mesSelecionado={mes} />
            <GraficoCategorias dados={resumo?.porCategoria ?? []} cores={coresCategorias} />
            <TabelaTransacoes transacoes={transacoes} cores={coresCategorias} onEditar={setEditando} onRemover={remover} />
          </div>
        </div>
      </main>

      <ModalCategorias
        aberto={gerenciarCategorias !== null}
        tipoInicial={gerenciarCategorias ?? 'despesa'}
        onFechar={() => setGerenciarCategorias(null)}
        onAlterado={() => { carregarCategorias(); carregar() }}
      />

      <ModalImportar
        aberto={importando}
        categorias={categorias}
        onFechar={() => setImportando(false)}
        onImportado={aposImportar}
      />
    </div>
  )
}
