import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Bell, Menu, Search } from 'lucide-react'
import Sidebar from '../components/Sidebar'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agenda': 'Agenda',
  '/chat': 'Chat',
  '/clientes': 'Clientes',
  '/configuracoes': 'Configurações',
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

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
          <div className="topbar-search">
            <Search size={16} />
            <input placeholder="Buscar paciente, telefone, CPF..." />
          </div>
          <button className="icon-btn" aria-label="Notificações">
            <Bell size={20} />
            <span className="dot" />
          </button>
          <div className="avatar" title="Dra. Ana Souza">AS</div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
