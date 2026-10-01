import { NavLink } from 'react-router-dom'
import {
  CalendarDays,
  ChevronsLeft,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Users,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/chat', label: 'Chat', icon: MessageCircle, badge: 4 },
  { to: '/clientes', label: 'Clientes', icon: Users },
]

type Props = {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onNavigate: () => void
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onNavigate }: Props) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <div className="brand">
        <div className="brand-logo">🦷</div>
        {!collapsed && (
          <div className="brand-text">
            <strong>Odonto Portal</strong>
            <span>Clínica Sorriso</span>
          </div>
        )}
      </div>

      <nav className="nav">
        {NAV.map(({ to, label, icon: Icon, badge }) => (
          <NavLink key={to} to={to} className="nav-item" onClick={onNavigate} title={label}>
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
            {badge ? <span className="nav-badge">{badge}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="nav nav-bottom">
        <NavLink to="/configuracoes" className="nav-item" onClick={onNavigate} title="Configurações">
          <Settings size={20} />
          {!collapsed && <span>Configurações</span>}
        </NavLink>
        <button className="nav-item collapse-btn" onClick={onToggle} title={collapsed ? 'Expandir' : 'Recolher'}>
          <ChevronsLeft size={20} className="collapse-icon" />
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  )
}
