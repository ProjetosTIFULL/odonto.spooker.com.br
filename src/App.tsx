import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { podeAcessar, telaInicial, type Modulo } from './auth/permissoes'
import AppLayout from './layouts/AppLayout'
import Agenda from './pages/Agenda'
import Chat from './pages/Chat'
import Clientes from './pages/Clientes'
import Configuracoes from './pages/Configuracoes'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

/** Exige login; sem sessão, manda para /login lembrando a tela pedida. */
function Protegido({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth()
  const location = useLocation()
  if (carregando) return <div className="tela-carregando">Carregando...</div>
  if (!usuario) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

/** Exige permissão no módulo; sem acesso, volta para a tela inicial do perfil. */
function ComAcesso({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const { usuario } = useAuth()
  if (!usuario || !podeAcessar(usuario.papel, modulo)) return <Navigate to={usuario ? telaInicial(usuario.papel) : '/login'} replace />
  return children
}

/** /login: sem sessão mostra o formulário; com sessão volta para a tela pedida (se tiver acesso) ou para a inicial. */
function RotaLogin() {
  const { usuario } = useAuth()
  const location = useLocation()
  if (!usuario) return <Login />
  const destino = (location.state as { from?: string } | null)?.from
  const modulo = destino?.split('/')[1] as Modulo | undefined
  return <Navigate to={destino && modulo && podeAcessar(usuario.papel, modulo) ? destino : telaInicial(usuario.papel)} replace />
}

function Inicio() {
  const { usuario } = useAuth()
  return <Navigate to={usuario ? telaInicial(usuario.papel) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RotaLogin />} />
      <Route
        element={
          <Protegido>
            <AppLayout />
          </Protegido>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="/dashboard" element={<ComAcesso modulo="dashboard"><Dashboard /></ComAcesso>} />
        <Route path="/agenda" element={<ComAcesso modulo="agenda"><Agenda /></ComAcesso>} />
        <Route path="/chat" element={<ComAcesso modulo="chat"><Chat /></ComAcesso>} />
        <Route path="/clientes" element={<ComAcesso modulo="clientes"><Clientes /></ComAcesso>} />
        <Route path="/configuracoes" element={<ComAcesso modulo="configuracoes"><Configuracoes /></ComAcesso>} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}
