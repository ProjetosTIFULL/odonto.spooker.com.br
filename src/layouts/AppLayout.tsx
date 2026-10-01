import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Bell, LogOut, Menu, Search } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth, useUsuario } from '../auth/AuthContext'
import { PAPEL_LABEL, podeAcessar } from '../auth/permissoes'

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
  const usuario = useUsuario()
  // Busca global procura pacientes: só para quem acessa Clientes
  const mostraBusca = podeAcessar(usuario.papel, 'clientes')

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
            <div className="topbar-search">
              <Search size={16} />
              <input placeholder="Buscar paciente, telefone, CPF..." />
            </div>
          )}
          <button className="icon-btn" aria-label="Notificações">
            <Bell size={20} />
            <span className="dot" />
          </button>
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
