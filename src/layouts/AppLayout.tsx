import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, Search } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth, useUsuario } from '../auth/AuthContext'
import { PAPEL_LABEL, podeAcessar } from '../auth/permissoes'
import { api } from '../lib/api'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/chat': 'Chat',
  '/clientes': 'Clientes',
  '/configuracoes': 'Configurações',
}

const iniciais = (nome: string) =>
  nome
    .replace(/^Dra?\.\s+/, '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const usuario = useUsuario()
  // Busca global procura pacientes: só para quem acessa Clientes
  const mostraBusca = podeAcessar(usuario.papel, 'clientes')
  const [textoBusca, setTextoBusca] = useState('')
  const mostraNotificacoes = podeAcessar(usuario.papel, 'chat')
  const [naoLidas, setNaoLidas] = useState(0)

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textoBusca.trim()) return
    navigate(`/clientes?busca=${encodeURIComponent(textoBusca.trim())}`)
  }

  // Notificação = mensagens de WhatsApp ainda não lidas no Chat (único tipo de
  // notificação que já existe de verdade no sistema hoje).
  useEffect(() => {
    if (!mostraNotificacoes) return
    const carregar = () =>
      api<{ naoLidas: number }[]>('/conversas')
        .then((cs) => setNaoLidas(cs.reduce((soma, c) => soma + c.naoLidas, 0)))
        .catch(() => {})
    carregar()
    const t = setInterval(carregar, 15000)
    return () => clearInterval(t)
  }, [mostraNotificacoes])

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className="backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <h1 className="topbar-title">{TITLES[pathname] ?? ''}</h1>
          {mostraBusca && (
            <form className="topbar-search" onSubmit={buscar}>
              <Search size={16} />
              <input
                placeholder="Buscar paciente, telefone, CPF..."
                value={textoBusca}
                onChange={(e) => setTextoBusca(e.target.value)}
              />
            </form>
          )}
          {mostraNotificacoes && (
            <button
              className="icon-btn"
              aria-label={naoLidas > 0 ? `${naoLidas} mensagem(ns) não lida(s)` : 'Nenhuma mensagem nova'}
              title="Ir para o Chat"
              onClick={() => navigate('/chat')}
            >
              <Bell size={20} />
              {naoLidas > 0 && <span className="dot" />}
            </button>
          )}
          <MenuUsuario />
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function MenuUsuario() {
  const usuario = useUsuario()
  const { sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar" title={usuario.nome} aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {iniciais(usuario.nome)}
      </button>
      {aberto && (
        <div className="user-menu-pop card" role="menu">
          <strong>{usuario.nome}</strong>
          <small>{usuario.email}</small>
          <span className="badge">{PAPEL_LABEL[usuario.papel]}</span>
          <button className="btn btn-ghost btn-sm" role="menuitem" onClick={sair}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      )}
    </div>
  )
}
