import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import EventCalendar, { type CalendarEvent, type EventChange, type SlotInfo } from '../components/calendar/EventCalendar'
import { fmtFullDay, fmtTime, minutesLabel, minutesOfDay, overlaps } from '../components/calendar/dates'
import { Modal, StatusBadge } from '../components/ui'
import {
  consultas as mockConsultas,
  getPaciente,
  getProfissional,
  horariosAtendimento,
  pacientes,
  procedimentos,
  profissionais,
  statusLabel,
  type StatusConsulta,
} from '../data/mock'

type Agendamento = {
  id: string
  pacienteId: string
  profissionalId: string
  procedimento: string
  status: StatusConsulta
  start: Date
  end: Date
}

/** Status que ocupam o horário e ainda podem ser remarcados. */
const EDITAVEIS: StatusConsulta[] = ['agendada', 'confirmada']
const OCUPAM: StatusConsulta[] = ['agendada', 'confirmada', 'em_atendimento', 'concluida']

const toDate = (data: string, hhmm: string) => new Date(`${data}T${hhmm}:00`)
const hhmmToMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

const isClosed = (day: Date, minutes: number) => {
  const h = horariosAtendimento[day.getDay()]
  return !h || minutes < hhmmToMin(h.abre) || minutes >= hhmmToMin(h.fecha)
}

export default function Agenda() {
  const [agenda, setAgenda] = useState<Agendamento[]>(() =>
    mockConsultas.map((c) => ({
      id: c.id,
      pacienteId: c.pacienteId,
      profissionalId: c.profissionalId,
      procedimento: c.procedimento,
      status: c.status,
      start: toDate(c.data, c.inicio),
      end: toDate(c.data, c.fim),
    })),
  )
  const [filtroProf, setFiltroProf] = useState('todos')
  const [aviso, setAviso] = useState<string | null>(null)
  const [novo, setNovo] = useState<SlotInfo | null>(null)
  const [aberto, setAberto] = useState<Agendamento | null>(null)
  // Relógio da tela: consultas viram somente-leitura quando o horário chega
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const profsVisiveis = profissionais.filter((p) => filtroProf === 'todos' || p.id === filtroProf)

  const events = useMemo<CalendarEvent<Agendamento>[]>(
    () =>
      agenda
        .filter((a) => filtroProf === 'todos' || a.profissionalId === filtroProf)
        .map((a) => ({
          id: a.id,
          title: getPaciente(a.pacienteId)?.nome ?? 'Paciente',
          subtitle: a.procedimento,
          start: a.start,
          end: a.end,
          color: getProfissional(a.profissionalId).cor,
          resourceId: a.profissionalId,
          // Já começou: não dá para remarcar arrastando (o status ainda pode ser alterado no detalhe)
          readOnly: !EDITAVEIS.includes(a.status) || a.start <= agora,
          // Horário passou e ninguém deu baixa (concluída / faltou)
          className: `status-${a.status} ${a.start <= agora && EDITAVEIS.includes(a.status) ? 'is-pendente' : ''}`,
          data: a,
        })),
    [agenda, filtroProf, agora],
  )

  /** Mesma regra da API: um profissional não pode ter duas consultas no mesmo horário. */
  const conflito = (profissionalId: string, start: Date, end: Date, ignorarId?: string) =>
    agenda.find(
      (a) => a.id !== ignorarId && a.profissionalId === profissionalId && OCUPAM.includes(a.status) && overlaps(a.start, a.end, start, end),
    )

  const mover = ({ event, start, end, resourceId }: EventChange<Agendamento>) => {
    const profissionalId = resourceId ?? event.data!.profissionalId
    if (start < new Date()) {
      setAviso('Não é possível remarcar para um horário que já passou.')
      return
    }
    const c = conflito(profissionalId, start, end, event.id)
    if (c) {
      setAviso(`Conflito com ${getPaciente(c.pacienteId)?.nome} às ${fmtTime.format(c.start)} (${getProfissional(profissionalId).nome}).`)
      return
    }
    if (isClosed(start, minutesOfDay(start))) setAviso('Atenção: horário fora do expediente.')
    setAgenda((as) => as.map((a) => (a.id === event.id ? { ...a, start, end, profissionalId } : a)))
  }

  const criar = (a: Omit<Agendamento, 'id' | 'status'>) => {
    if (a.start < new Date()) return 'Esse horário já passou. Escolha um horário futuro.'
    const c = conflito(a.profissionalId, a.start, a.end)
    if (c) return `Conflito com ${getPaciente(c.pacienteId)?.nome} às ${fmtTime.format(c.start)}.`
    setAgenda((as) => [...as, { ...a, id: crypto.randomUUID(), status: 'agendada' }])
    setNovo(null)
    return null
  }

  const abrirNovo = () => {
    const start = new Date()
    start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0)
    setNovo({ start, end: new Date(start.getTime() + 30 * 60_000) })
  }

  return (
    <div className="page agenda-page">
      {aviso && <div className="toast" role="status">{aviso}</div>}

      <EventCalendar<Agendamento>
        events={events}
        resources={profsVisiveis.map((p) => ({ id: p.id, title: p.nome, color: p.cor }))}
        defaultView="semana"
        dayStartHour={7}
        dayEndHour={20}
        hiddenWeekdays={[0]}
        isClosed={isClosed}
        onEventChange={mover}
        onSlotClick={(slot) => (slot.start < new Date() ? setAviso('Esse horário já passou.') : setNovo(slot))}
        onEventClick={(e) => setAberto(e.data!)}
        renderEvent={(ev, { compact }) => (
          <>
            <strong>{ev.title}</strong>
            {!compact && (
              <>
                <small>{fmtTime.format(ev.start)} · {ev.subtitle}</small>
                <StatusBadge status={ev.data!.status} />
              </>
            )}
          </>
        )}
        toolbarExtra={
          <>
            <select value={filtroProf} onChange={(e) => setFiltroProf(e.target.value)} className="input">
              <option value="todos">Todos os profissionais</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={abrirNovo}><Plus size={16} /> Nova consulta</button>
          </>
        }
      />

      <p className="muted small">
        Arraste para remarcar · puxe a borda inferior para mudar a duração · clique num horário livre para agendar.
        Consultas que já começaram, concluídas, faltas e canceladas não podem ser movidas.
        Contorno laranja tracejado = horário já passou e falta marcar como concluída ou faltou (clique na consulta).
      </p>

      {novo && <NovaConsulta slot={novo} onClose={() => setNovo(null)} onSalvar={criar} />}
      {aberto && (
        <DetalheConsulta
          consulta={aberto}
          onClose={() => setAberto(null)}
          onStatus={(status) => {
            setAgenda((as) => as.map((a) => (a.id === aberto.id ? { ...a, status } : a)))
            setAberto(null)
          }}
          onExcluir={() => {
            setAgenda((as) => as.filter((a) => a.id !== aberto.id))
            setAberto(null)
          }}
        />
      )}
    </div>
  )
}

function NovaConsulta({
  slot,
  onClose,
  onSalvar,
}: {
  slot: SlotInfo
  onClose: () => void
  onSalvar: (a: Omit<Agendamento, 'id' | 'status'>) => string | null
}) {
  const [pacienteId, setPacienteId] = useState(pacientes[0].id)
  const [profissionalId, setProfissionalId] = useState(slot.resourceId ?? profissionais[0].id)
  const [procIdx, setProcIdx] = useState(0)
  const [data, setData] = useState(() => {
    const d = slot.start
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [hora, setHora] = useState(minutesLabel(minutesOfDay(slot.start)))
  const [erro, setErro] = useState<string | null>(null)

  const proc = procedimentos[procIdx]
  const start = new Date(`${data}T${hora}:00`)
  const end = new Date(start.getTime() + proc.duracao * 60_000)

  const salvar = () => {
    if (Number.isNaN(start.getTime())) return setErro('Data ou hora inválida.')
    setErro(onSalvar({ pacienteId, profissionalId, procedimento: proc.nome, start, end }))
  }

  return (
    <Modal
      title="Nova consulta"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Agendar</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="span-2">Paciente
          <select className="input" value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
            {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label>Profissional
          <select className="input" value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label>Procedimento
          <select className="input" value={procIdx} onChange={(e) => setProcIdx(Number(e.target.value))}>
            {procedimentos.map((p, i) => <option key={p.nome} value={i}>{p.nome} ({p.duracao} min)</option>)}
          </select>
        </label>
        <label>Data<input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label>Horário<input type="time" className="input" step={900} value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      </div>
      {!Number.isNaN(end.getTime()) && (
        <p className="muted small">Término previsto às {fmtTime.format(end)}.</p>
      )}
      {erro && <p className="text-danger small">{erro}</p>}
    </Modal>
  )
}

function DetalheConsulta({
  consulta,
  onClose,
  onStatus,
  onExcluir,
}: {
  consulta: Agendamento
  onClose: () => void
  onStatus: (s: StatusConsulta) => void
  onExcluir: () => void
}) {
  const pac = getPaciente(consulta.pacienteId)
  const prof = getProfissional(consulta.profissionalId)
  const [status, setStatus] = useState(consulta.status)

  return (
    <Modal
      title={pac?.nome ?? 'Consulta'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost text-danger" onClick={onExcluir}>Excluir</button>
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={() => onStatus(status)} disabled={status === consulta.status}>Salvar</button>
        </>
      }
    >
      <dl className="details">
        <dt>Quando</dt>
        <dd>{fmtFullDay.format(consulta.start)}, {fmtTime.format(consulta.start)} – {fmtTime.format(consulta.end)}</dd>
        <dt>Profissional</dt>
        <dd><i className="dot" style={{ background: prof.cor }} /> {prof.nome}</dd>
        <dt>Procedimento</dt>
        <dd>{consulta.procedimento}</dd>
        <dt>Telefone</dt>
        <dd>{pac?.telefone}</dd>
        <dt>Status</dt>
        <dd>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusConsulta)}>
            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </dd>
      </dl>
    </Modal>
  )
}
