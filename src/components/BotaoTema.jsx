import { useEffect, useState } from 'react'

function temaSalvo() {
  try { return localStorage.getItem('tema') === 'escuro' ? 'escuro' : 'claro' } catch { return 'claro' }
}

export default function BotaoTema() {
  const [tema, setTema] = useState(temaSalvo)

  useEffect(() => {
    if (tema === 'escuro') document.documentElement.dataset.theme = 'escuro'
    else delete document.documentElement.dataset.theme
    try { localStorage.setItem('tema', tema) } catch {}
  }, [tema])

  const escuro = tema === 'escuro'
  return (
    <button className="botao" onClick={() => setTema(escuro ? 'claro' : 'escuro')} aria-pressed={escuro}
      title={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
      <span aria-hidden="true">{escuro ? '☀' : '☾'}</span> {escuro ? 'Claro' : 'Escuro'}
    </button>
  )
}
