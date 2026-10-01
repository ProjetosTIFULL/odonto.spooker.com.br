import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setOnUnauthorized, tokenStore } from '../lib/api'
import type { FuncaoColaborador, Papel } from './permissoes'

export type Usuario = {
  id: string
  nome: string
  email: string
  papel: Papel
  clinicaId: string
  clinica: { id: string; nome: string; tipo: 'CLINICA' | 'AUTONOMO' }
  profissional: { id: string; nome: string; funcao: FuncaoColaborador } | null
}

type AuthState = {
  usuario: Usuario | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<Usuario>
  sair: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(() => !!tokenStore.get())

  const sair = useCallback(() => {
    tokenStore.set(null)
    setUsuario(null)
  }, [])

  // Sessão salva: valida o token e recarrega o perfil (pode ter mudado)
  useEffect(() => {
    setOnUnauthorized(sair)
    if (!tokenStore.get()) return
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(sair)
      .finally(() => setCarregando(false))
  }, [sair])

  const entrar = useCallback(async (email: string, senha: string) => {
    const { token } = await api<{ token: string }>('/auth/login', { method: 'POST', body: { email, senha } })
    tokenStore.set(token)
    const u = await api<Usuario>('/auth/me')
    setUsuario(u)
    return u
  }, [])

  const value = useMemo(() => ({ usuario, carregando, entrar, sair }), [usuario, carregando, entrar, sair])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

/** Usuário logado (só usar em telas protegidas). */
export function useUsuario() {
  const { usuario } = useAuth()
  if (!usuario) throw new Error('Nenhum usuário logado')
  return usuario
}
