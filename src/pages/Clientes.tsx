import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle, Plus, Search } from 'lucide-react'
import { Avatar, Card, Modal } from '../components/ui'
import { api } from '../lib/api'

type StatusApi = 'ATIVO' | 'EM_TRATAMENTO' | 'INATIVO'
type PacienteApi = {
  id: string
  nome: string
  telefone: string
  email: string | null
  convenio: string | null
  status: StatusApi
  ultimaVisita: string | null
  proximaConsulta: { id: string; inicio: string; profissional: { nome: string } } | null
}

const STATUS: Record<StatusApi, string> = {
  ATIVO: 'Ativo',
  EM_TRATAMENTO: 'Em tratamento',
  INATIVO: 'Inativo',
}

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const fmtDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Clientes() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [busca, setBusca] = useState(params.get('busca') ?? '')
  const [status, setStatus] = useState<'todos' | StatusApi>('todos')
  const [lista, setLista] = useState<PacienteApi[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [indoParaChat, setIndoParaChat] = useState<string | null>(null)

  const recarregar = useCallback(() => {
    const q = new URLSearchParams()
    if (busca.trim()) q.set('busca', busca.trim())
    if (status !== 'todos') q.set('status', status)
    q.set('porPagina', '100')
    return api<{ total: number; itens: PacienteApi[] }>(`/pacientes?${q}`)
      .then((r) => {
        setLista(r.itens)
        setTotal(r.total)
        setErro(null)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [busca, status])

  // Busca com debounce - evita chamar a API a cada tecla digitada
  useEffect(() => {
    setCarregando(true)
    const t = setTimeout(recarregar, 300)
    return () => clearTimeout(t)
  }, [recarregar])

  // Veio da busca global do topo (?busca=...) - limpa da URL depois de aplicar, pra não prender o campo
  useEffect(() => {
    if (params.get('busca')) setParams({}, { replace: true })
  }, [params, setParams])

  const conversarNoWhatsApp = async (p: PacienteApi) => {
    setIndoParaChat(p.id)
    try {
      const conversa = await api<{ id: string }>('/conversas', { method: 'POST', body: { telefone: p.telefone, nomeContato: p.nome } })
      navigate(`/chat?conversa=${conversa.id}`)
    } catch (e) {
      setErro((e as Error).message)
      setIndoParaChat(null)
    }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-group">
          <div className="input-icon">
            <Search size={16} />
            <input className="input" placeholder="Nome, telefone ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todos">Todos os status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoAberto(true)}><Plus size={16} /> Novo paciente</button>
      </div>

      {erro && <div className="alerta">{erro}</div>}

      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Convênio</th>
                <th>Última visita</th>
                <th>Próxima consulta</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="cell-user">
                      <Avatar nome={p.nome} />
                      <div>
                        <strong>{p.nome}</strong>
                        <small className="muted">{p.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.telefone}</td>
                  <td>{p.convenio ?? '—'}</td>
                  <td>{fmtData(p.ultimaVisita)}</td>
                  <td>{p.proximaConsulta ? fmtDataHora(p.proximaConsulta.inicio) : '—'}</td>
                  <td><span className={`badge badge-p-${p.status.toLowerCase()}`}>{STATUS[p.status]}</span></td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Conversar no WhatsApp"
                      disabled={indoParaChat === p.id}
                      onClick={() => conversarNoWhatsApp(p)}
                    >
                      <MessageCircle size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {!carregando && lista.length === 0 && (
                <tr><td colSpan={7} className="empty">Nenhum paciente encontrado.</td></tr>
              )}
              {carregando && (
                <tr><td colSpan={7} className="empty muted">Carregando...</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!carregando && total > lista.length && (
          <p className="muted small" style={{ padding: '8px 4px 0' }}>
            Mostrando {lista.length} de {total} — refine a busca pra ver mais.
          </p>
        )}
      </Card>

      {novoAberto && (
        <NovoPaciente
          onClose={() => setNovoAberto(false)}
          onCriado={() => {
            setNovoAberto(false)
            recarregar()
          }}
        />
      )}
    </div>
  )
}

function NovoPaciente({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [convenio, setConvenio] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    if (nome.trim().length < 2) return setErro('Informe o nome completo.')
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Informe um telefone válido, com DDD.')
    setSalvando(true)
    setErro(null)
    try {
      await api<PacienteApi>('/pacientes', {
        method: 'POST',
        body: {
          nome: nome.trim(),
          telefone,
          email: email.trim() || null,
          convenio: convenio.trim() || null,
          nascimento: nascimento || null,
        },
      })
      onCriado()
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal
      title="Novo paciente"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="span-2">Nome completo<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label>Telefone (com DDD)<input className="input" placeholder="(51) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></label>
        <label>E-mail<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Convênio<input className="input" value={convenio} onChange={(e) => setConvenio(e.target.value)} /></label>
        <label>Nascimento<input className="input" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} /></label>
      </div>
      {erro && <p className="text-danger small">{erro}</p>}
    </Modal>
  )
}
