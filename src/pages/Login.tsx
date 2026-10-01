import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

// O redirecionamento após entrar fica na rota /login (App.tsx): ela volta para a tela que a pessoa pediu.
export default function Login() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email.trim(), senha)
    } catch (err) {
      setErro((err as Error).message)
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <form className="login-card card" onSubmit={submit}>
        <div className="brand login-brand">
          <div className="brand-logo">🦷</div>
          <div className="brand-text">
            <strong>Odonto Portal</strong>
            <span>Acesse sua conta</span>
          </div>
        </div>
        <label>E-mail
          <input className="input" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>Senha
          <input className="input" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <p className="text-danger small">{erro}</p>}
        <button className="btn btn-primary" disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
        {import.meta.env.DEV && (
          <p className="muted small">
            Demo (senha <b>demo1234</b>): admin@demo.com · recepcao@demo.com · ana@demo.com
          </p>
        )}
      </form>
    </div>
  )
}
