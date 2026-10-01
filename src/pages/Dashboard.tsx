import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarDays, Cake, DollarSign, MessageCircle, UserPlus, UserX } from 'lucide-react'
import { Avatar, Card, StatusBadge } from '../components/ui'
import { consultas, conversas, getPaciente, getProfissional, hoje, pacientes } from '../data/mock'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Dashboard() {
  const doDia = consultas.filter((c) => c.data === hoje).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const confirmadas = doDia.filter((c) => ['confirmada', 'em_atendimento', 'concluida'].includes(c.status)).length
  const faltas = doDia.filter((c) => c.status === 'faltou').length
  const naoLidas = conversas.reduce((s, c) => s + c.naoLidas, 0)

  const mesAtual = hoje.slice(5, 7)
  const aniversariantes = pacientes.filter((p) => p.nascimento.slice(5, 7) === mesAtual)

  const kpis = [
    { label: 'Consultas hoje', value: doDia.length, hint: `${confirmadas} confirmadas`, icon: CalendarDays, tone: 'teal' },
    { label: 'Taxa de confirmação', value: `${Math.round((confirmadas / Math.max(doDia.length, 1)) * 100)}%`, hint: `${faltas} falta(s) hoje`, icon: CalendarCheck, tone: 'green' },
    { label: 'Faturamento do mês', value: brl(38450), hint: '+12% vs. mês anterior', icon: DollarSign, tone: 'purple' },
    { label: 'Novos pacientes', value: 14, hint: 'no mês', icon: UserPlus, tone: 'orange' },
  ]

  return (
    <div className="page">
      <div className="kpi-grid">
        {kpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="kpi">
            <div className={`kpi-icon tone-${tone}`}>
              <Icon size={20} />
            </div>
            <div>
              <span className="kpi-label">{label}</span>
              <strong className="kpi-value">{value}</strong>
              <span className="kpi-hint">{hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2-1">
        <Card title="Agenda de hoje" action={<Link to="/agenda" className="link">Ver agenda</Link>}>
          <ul className="list">
            {doDia.map((c) => {
              const pac = getPaciente(c.pacienteId)!
              const prof = getProfissional(c.profissionalId)
              return (
                <li key={c.id} className="list-row">
                  <span className="time">{c.inicio}</span>
                  <span className="prof-bar" style={{ background: prof.cor }} />
                  <div className="grow">
                    <strong>{pac.nome}</strong>
                    <small>{c.procedimento} · {prof.nome}</small>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="stack">
          <Card title="WhatsApp" action={<Link to="/chat" className="link">Abrir chat</Link>}>
            <p className="muted small">
              <MessageCircle size={14} className="inline-icon" /> {naoLidas} mensagens não lidas
            </p>
            <ul className="list">
              {conversas.filter((c) => c.naoLidas > 0).map((c) => (
                <li key={c.id} className="list-row">
                  <Avatar nome={c.nome} />
                  <div className="grow ellipsis">
                    <strong>{c.nome}</strong>
                    <small>{c.ultimaMensagem}</small>
                  </div>
                  <span className="count">{c.naoLidas}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Aniversariantes do mês">
            <ul className="list">
              {aniversariantes.map((p) => (
                <li key={p.id} className="list-row">
                  <Cake size={18} className="muted" />
                  <div className="grow">
                    <strong>{p.nome}</strong>
                    <small>{p.nascimento.slice(8, 10)}/{p.nascimento.slice(5, 7)}</small>
                  </div>
                  <button className="btn btn-ghost btn-sm">Enviar parabéns</button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Atenção">
            <ul className="list">
              <li className="list-row">
                <UserX size={18} className="text-danger" />
                <div className="grow">
                  <strong>{pacientes.filter((p) => p.status === 'inativo').length} paciente(s) sem retorno há +6 meses</strong>
                  <small>Sugestão: campanha de retorno via WhatsApp</small>
                </div>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
