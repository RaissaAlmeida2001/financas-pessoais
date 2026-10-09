// Chamadas à API. Erros viram exceções com a mensagem (e os campos) que o servidor mandou.
async function requisitar(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  })
  if (resposta.status === 204) return null
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const erro = new Error(corpo.erro || 'Não foi possível falar com o servidor.')
    erro.campos = corpo.campos
    throw erro
  }
  return corpo
}

export const api = {
  categorias: () => requisitar('/categorias'),
  transacoes: mes => requisitar(`/transacoes?mes=${mes}`),
  resumo: mes => requisitar(`/resumo?mes=${mes}`),
  evolucao: (ate, meses = 6) => requisitar(`/evolucao?ate=${ate}&meses=${meses}`),
  criar: dados => requisitar('/transacoes', { method: 'POST', body: JSON.stringify(dados) }),
  atualizar: (id, dados) => requisitar(`/transacoes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
  remover: id => requisitar(`/transacoes/${id}`, { method: 'DELETE' }),
  categoriasDetalhes: () => requisitar('/categorias/detalhes'),
  criarCategoria: dados => requisitar('/categorias', { method: 'POST', body: JSON.stringify(dados) }),
  atualizarCategoria: (id, dados) => requisitar(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
  removerCategoria: id => requisitar(`/categorias/${id}`, { method: 'DELETE' }),
  previaImportacao: conteudo => requisitar('/importacao/previa', { method: 'POST', body: JSON.stringify({ conteudo }) }),
  importar: transacoes => requisitar('/importacao', { method: 'POST', body: JSON.stringify({ transacoes }) }),
}
