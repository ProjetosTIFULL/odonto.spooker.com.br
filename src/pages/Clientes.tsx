import { useState } from 'react'
import { MessageCircle, Plus, Search } from 'lucide-react'
import { Avatar, Card } from '../components/ui'
import { consultas, pacientes, type Paciente } from '../data/mock'

const STATUS: Record<Paciente['status'], string> = {
  ativo: 'Ativo',
  em_tratamento: 'Em tratamento',
  inativo: 'Inativo',
}

const fmtData = (iso: string | null) => (iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—')

export default function Clientes() {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<'todos' | Paciente['status']>('todos')

  const lista = pacientes.filter((p) => {
    const q = busca.toLowerCase()
    const bate = !q || p.nome.toLowerCase().includes(q) || p.telefone.includes(q) || p.email.includes(q)
    return bate && (status === 'todos' || p.status === status)
  })

  const proxima = (id: string) =>
    consultas
      .filter((c) => c.pacienteId === id && ['agendada', 'confirmada'].includes(c.status))
      .sort((a, b) => (a.data + a.inicio).localeCompare(b.data + b.inicio))[0]

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
        <button className="btn btn-primary"><Plus size={16} /> Novo paciente</button>
      </div>

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
              {lista.map((p) => {
                const prox = proxima(p.id)
                return (
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
                    <td>{p.convenio}</td>
                    <td>{fmtData(p.ultimaVisita)}</td>
                    <td>{prox ? `${fmtData(prox.data)} ${prox.inicio}` : '—'}</td>
                    <td><span className={`badge badge-p-${p.status}`}>{STATUS[p.status]}</span></td>
                    <td>
                      <button className="icon-btn" title="Conversar no WhatsApp"><MessageCircle size={18} /></button>
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="empty">Nenhum paciente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
