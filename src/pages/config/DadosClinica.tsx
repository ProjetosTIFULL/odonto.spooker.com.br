import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

type Clinica = {
  tipo: 'CLINICA' | 'AUTONOMO'
  nome: string
  documento: string | null
  cro: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
}

export default function DadosClinica() {
  const [f, setF] = useState<Clinica | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const set = <K extends keyof Clinica>(k: K, v: Clinica[K]) => setF((s) => (s ? { ...s, [k]: v } : s))

  useEffect(() => {
    api<Clinica>('/clinica').then(setF).catch((e) => setErro(e.message))
  }, [])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f) return
    setSalvando(true)
    setErro(null)
    try {
      await api('/clinica', { method: 'PUT', body: f })
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (!f) return <Card title="Dados da clínica">{erro ? <p className="text-danger small">{erro}</p> : <p className="muted">Carregando...</p>}</Card>

  const vazioNull = (s: string) => s.trim() || null

  return (
    <Card title="Dados da clínica">
      <form className="form-grid" onSubmit={salvar}>
        <label>Tipo de conta
          <select className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value as Clinica['tipo'])}>
            <option value="CLINICA">Clínica</option>
            <option value="AUTONOMO">Dentista autônomo</option>
          </select>
        </label>
        <label>Nome / Razão social<input className="input" required minLength={2} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
        <label>CNPJ / CPF<input className="input" placeholder="00.000.000/0000-00" value={f.documento ?? ''} onChange={(e) => set('documento', vazioNull(e.target.value))} /></label>
        <label>CRO responsável<input className="input" placeholder="CRO-RS 00000" value={f.cro ?? ''} onChange={(e) => set('cro', vazioNull(e.target.value))} /></label>
        <label>Telefone<input className="input" value={f.telefone ?? ''} onChange={(e) => set('telefone', vazioNull(e.target.value))} /></label>
        <label>E-mail<input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', vazioNull(e.target.value))} /></label>
        <label className="span-2">Endereço<input className="input" placeholder="Rua, número, bairro, cidade" value={f.endereco ?? ''} onChange={(e) => set('endereco', vazioNull(e.target.value))} /></label>
        {erro && <p className="text-danger small span-2">{erro}</p>}
        <div className="span-2">
          <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando...' : salvo ? 'Salvo!' : 'Salvar'}</button>
        </div>
      </form>
    </Card>
  )
}
