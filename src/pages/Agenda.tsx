import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useUsuario } from '../auth/AuthContext'
import EventCalendar, { type CalendarEvent, type CalendarView, type EventChange, type SlotInfo } from '../components/calendar/EventCalendar'
import { addDays, fmtFullDay, fmtTime, minutesLabel, minutesOfDay } from '../components/calendar/dates'
import { Modal, StatusBadge } from '../components/ui'
import { statusLabel, type StatusConsulta } from '../data/mock'
import { api } from '../lib/api'

// ---------- Tipos da API ----------
type StatusApi = 'AGENDADA' | 'CONFIRMADA' | 'EM_ATENDIMENTO' | 'CONCLUIDA' | 'FALTOU' | 'CANCELADA'

type ConsultaApi = {
  id: string
  inicio: string
  fim: string
  status: StatusApi
  paciente: { id: string; nome: string; telefone: string }
  profissional: { id: string; nome: string; cor: string }
  procedimento: { id: string; nome: string } | null
}
type Dentista = { id: string; nome: string; cor: string; especialidade: string | null }
type Procedimento = { id: string; nome: string; duracaoMin: number }
type Horario = { diaSemana: number; abre: string; fecha: string; ativo: boolean }
type PacienteResumo = { id: string; nome: string; telefone: string }

type Agendamento = {
  id: string
  paciente: ConsultaApi['paciente']
  profissional: ConsultaApi['profissional']
  procedimento: string
  status: StatusConsulta
  start: Date
  end: Date
}

/** Status que ainda podem ser remarcados arrastando. */
const EDITAVEIS: StatusConsulta[] = ['agendada', 'confirmada']

const daApi = (c: ConsultaApi): Agendamento => ({
  id: c.id,
  paciente: c.paciente,
  profissional: c.profissional,
  procedimento: c.procedimento?.nome ?? 'Consulta',
  status: c.status.toLowerCase() as StatusConsulta,
  start: new Date(c.inicio),
  end: new Date(c.fim),
})

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** 5551998123344 -> (51) 99812-3344 */
const fmtTelefone = (t: string) => {
  const m = t.replace(/^55/, '').match(/^(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t
}
const hhmmToMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

export default function Agenda() {
  const usuario = useUsuario()
  // Dentista vê e mexe só na própria agenda (a API aplica a mesma regra)
  const meuDentistaId = usuario.papel === 'DENTISTA' ? (usuario.profissional?.id ?? null) : null
  const ehDentista = usuario.papel === 'DENTISTA'

  const [agenda, setAgenda] = useState<Agendamento[]>([])
  const [dentistas, setDentistas] = useState<Dentista[]>([])
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [filtroProf, setFiltroProf] = useState('todos')
  const [aviso, setAviso] = useState<string | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [novo, setNovo] = useState<SlotInfo | null>(null)
  const [aberto, setAberto] = useState<Agendamento | null>(null)
  const [agora, setAgora] = useState(() => new Date())
  const range = useRef<{ start: Date; end: Date } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  // Cadastros de apoio
  useEffect(() => {
    Promise.all([
      api<Dentista[]>('/profissionais?funcao=DENTISTA'),
      api<Procedimento[]>('/procedimentos'),
      api<Horario[]>('/clinica/horarios'),
    ])
      .then(([d, p, h]) => {
        setDentistas(d)
        setProcedimentos(p)
        setHorarios(h)
      })
      .catch((e) => setErroCarga(e.message))
  }, [])

  // Consultas do período visível
  const carregarConsultas = useCallback(() => {
    const r = range.current
    if (!r) return
    api<ConsultaApi[]>(`/consultas?de=${isoLocal(r.start)}&ate=${isoLocal(addDays(r.end, -1))}`)
      .then((cs) => {
        setAgenda(cs.map(daApi))
        setErroCarga(null)
      })
      .catch((e) => setErroCarga(e.message))
  }, [])

  const onRangeChange = useCallback(
    (r: { start: Date; end: Date }) => {
      range.current = r
      carregarConsultas()
    },
    [carregarConsultas],
  )

  const horarioDoDia = useMemo(() => new Map(horarios.map((h) => [h.diaSemana, h])), [horarios])
  const isClosed = useCallback(
    (day: Date, minutes: number) => {
      const h = horarioDoDia.get(day.getDay())
      return !h?.ativo || minutes < hhmmToMin(h.abre) || minutes >= hhmmToMin(h.fecha)
    },
    [horarioDoDia],
  )
  const diasFechados = useMemo(() => horarios.filter((h) => !h.ativo).map((h) => h.diaSemana), [horarios])

  const dentistasVisiveis = dentistas.filter((d) =>
    meuDentistaId ? d.id === meuDentistaId : filtroProf === 'todos' || d.id === filtroProf,
  )

  const events = useMemo<CalendarEvent<Agendamento>[]>(
    () =>
      agenda
        .filter((a) => meuDentistaId || filtroProf === 'todos' || a.profissional.id === filtroProf)
        .map((a) => ({
          id: a.id,
          title: a.paciente.nome,
          subtitle: a.procedimento,
          start: a.start,
          end: a.end,
          color: a.profissional.cor,
          resourceId: a.profissional.id,
          // Já começou: não dá para remarcar arrastando (o status ainda pode ser alterado no detalhe)
          readOnly: !EDITAVEIS.includes(a.status) || a.start <= agora,
          // Horário passou e ninguém deu baixa (concluída / faltou)
          className: `status-${a.status} ${a.start <= agora && EDITAVEIS.includes(a.status) ? 'is-pendente' : ''}`,
          data: a,
        })),
    [agenda, filtroProf, meuDentistaId, agora],
  )

  /** Remarcar: atualiza na tela na hora e desfaz se a API recusar (conflito, horário passado...). */
  const mover = async ({ event, start, end, resourceId }: EventChange<Agendamento>) => {
    const antes = event.data!
    if (start < new Date()) return setAviso('Não é possível remarcar para um horário que já passou.')
    const trocaDentista = resourceId && resourceId !== antes.profissional.id
    const novoProf = trocaDentista ? dentistas.find((d) => d.id === resourceId) : undefined
    setAgenda((as) => as.map((a) => (a.id === antes.id ? { ...a, start, end, ...(novoProf && { profissional: novoProf }) } : a)))
    try {
      const salvo = await api<ConsultaApi>(`/consultas/${antes.id}`, {
        method: 'PUT',
        body: { inicio: start.toISOString(), fim: end.toISOString(), ...(trocaDentista && { profissionalId: resourceId }) },
      })
      setAgenda((as) => as.map((a) => (a.id === salvo.id ? daApi(salvo) : a)))
      if (isClosed(start, minutesOfDay(start))) setAviso('Atenção: horário fora do expediente.')
    } catch (e) {
      setAgenda((as) => as.map((a) => (a.id === antes.id ? antes : a)))
      setAviso((e as Error).message)
    }
  }

  const abrirSlot = (slot: SlotInfo) => {
    if (slot.start < new Date()) return setAviso('Esse horário já passou.')
    setNovo(slot)
  }

  const abrirNovo = () => {
    const start = new Date()
    start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0)
    setNovo({ start, end: new Date(start.getTime() + 30 * 60_000) })
  }

  const views: CalendarView[] = ehDentista ? ['mes', 'semana', 'dia', 'lista'] : ['mes', 'semana', 'dia', 'recursos', 'lista']
  const semVinculo = ehDentista && !meuDentistaId

  return (
    <div className="page agenda-page">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      {semVinculo && (
        <div className="alerta">
          Seu login não está vinculado a um dentista, então não há agenda para mostrar. Peça ao administrador para vincular em
          Configurações › Usuários e permissões.
        </div>
      )}
      {erroCarga && !semVinculo && <div className="alerta">{erroCarga}</div>}

      <EventCalendar<Agendamento>
        events={events}
        resources={dentistasVisiveis.map((d) => ({ id: d.id, title: d.nome, color: d.cor }))}
        views={views}
        defaultView="semana"
        dayStartHour={7}
        dayEndHour={20}
        hiddenWeekdays={diasFechados}
        isClosed={isClosed}
        onRangeChange={onRangeChange}
        onEventChange={mover}
        onSlotClick={abrirSlot}
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
            {ehDentista ? (
              meuDentistaId && <span className="minha-agenda">Minha agenda · {usuario.profissional?.nome}</span>
            ) : (
              <select value={filtroProf} onChange={(e) => setFiltroProf(e.target.value)} className="input">
                <option value="todos">Todos os profissionais</option>
                {dentistas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            )}
            {!semVinculo && <button className="btn btn-primary" onClick={abrirNovo}><Plus size={16} /> Nova consulta</button>}
          </>
        }
        legend={
          // Dentista só vê a própria agenda: uma cor só, legenda desnecessária
          !ehDentista &&
          dentistas.length > 0 && (
            <>
              <span className="ec-legend-titulo">Dentistas</span>
              {dentistas.map((p) => {
                const ativo = filtroProf === p.id
                const apagado = filtroProf !== 'todos' && !ativo
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`ec-legend-item ${ativo ? 'is-ativo' : ''} ${apagado ? 'is-apagado' : ''}`}
                    aria-pressed={ativo}
                    title={ativo ? 'Mostrar todos os dentistas' : `Mostrar só ${p.nome}`}
                    onClick={() => setFiltroProf(ativo ? 'todos' : p.id)}
                  >
                    <i style={{ background: p.cor }} aria-hidden />
                    {p.nome}
                    {p.especialidade && <small>{p.especialidade}</small>}
                  </button>
                )
              })}
            </>
          )
        }
      />

      <p className="muted small">
        Arraste para remarcar · puxe a borda inferior para mudar a duração · clique num horário livre para agendar.
        Consultas que já começaram, concluídas, faltas e canceladas não podem ser movidas.
        Contorno laranja tracejado = horário já passou e falta marcar como concluída ou faltou (clique na consulta).
      </p>

      {novo && (
        <NovaConsulta
          slot={novo}
          dentistas={meuDentistaId ? dentistas.filter((d) => d.id === meuDentistaId) : dentistas}
          procedimentos={procedimentos}
          onClose={() => setNovo(null)}
          onCriada={(c) => {
            setAgenda((as) => [...as, daApi(c)])
            setNovo(null)
          }}
        />
      )}
      {aberto && (
        <DetalheConsulta
          consulta={aberto}
          onClose={() => setAberto(null)}
          onAtualizada={(c) => {
            setAgenda((as) => as.map((a) => (a.id === c.id ? daApi(c) : a)))
            setAberto(null)
          }}
          onExcluida={() => {
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
  dentistas,
  procedimentos,
  onClose,
  onCriada,
}: {
  slot: SlotInfo
  dentistas: Dentista[]
  procedimentos: Procedimento[]
  onClose: () => void
  onCriada: (c: ConsultaApi) => void
}) {
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([])
  const [pacienteId, setPacienteId] = useState('')
  const [profissionalId, setProfissionalId] = useState(slot.resourceId ?? dentistas[0]?.id ?? '')
  const [procedimentoId, setProcedimentoId] = useState(procedimentos[0]?.id ?? '')
  const [data, setData] = useState(isoLocal(slot.start))
  const [hora, setHora] = useState(minutesLabel(minutesOfDay(slot.start)))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api<{ itens: PacienteResumo[] }>('/pacientes?porPagina=100')
      .then((r) => {
        setPacientes(r.itens)
        setPacienteId((id) => id || r.itens[0]?.id || '')
      })
      .catch((e) => setErro(e.message))
  }, [])

  const proc = procedimentos.find((p) => p.id === procedimentoId)
  const start = new Date(`${data}T${hora}:00`)
  const end = proc ? new Date(start.getTime() + proc.duracaoMin * 60_000) : null

  const salvar = async () => {
    if (Number.isNaN(start.getTime())) return setErro('Data ou hora inválida.')
    if (start < new Date()) return setErro('Esse horário já passou. Escolha um horário futuro.')
    setSalvando(true)
    setErro(null)
    try {
      onCriada(
        await api<ConsultaApi>('/consultas', {
          method: 'POST',
          body: { pacienteId, profissionalId, procedimentoId: procedimentoId || null, inicio: start.toISOString() },
        }),
      )
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal
      title="Nova consulta"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || !pacienteId || !profissionalId}>
            {salvando ? 'Agendando...' : 'Agendar'}
          </button>
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
          <select className="input" value={profissionalId} disabled={dentistas.length === 1} onChange={(e) => setProfissionalId(e.target.value)}>
            {dentistas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label>Procedimento
          <select className="input" value={procedimentoId} onChange={(e) => setProcedimentoId(e.target.value)}>
            {procedimentos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.duracaoMin} min)</option>)}
          </select>
        </label>
        <label>Data<input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label>Horário<input type="time" className="input" step={900} value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      </div>
      {end && !Number.isNaN(end.getTime()) && <p className="muted small">Término previsto às {fmtTime.format(end)}.</p>}
      {erro && <p className="text-danger small">{erro}</p>}
    </Modal>
  )
}

function DetalheConsulta({
  consulta,
  onClose,
  onAtualizada,
  onExcluida,
}: {
  consulta: Agendamento
  onClose: () => void
  onAtualizada: (c: ConsultaApi) => void
  onExcluida: () => void
}) {
  const [status, setStatus] = useState(consulta.status)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const executar = async (fn: () => Promise<void>) => {
    setSalvando(true)
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  const salvar = () =>
    executar(async () =>
      onAtualizada(await api<ConsultaApi>(`/consultas/${consulta.id}/status`, { method: 'PATCH', body: { status: status.toUpperCase() } })),
    )

  const excluir = () => {
    if (!confirm(`Excluir a consulta de ${consulta.paciente.nome}?`)) return
    executar(async () => {
      await api(`/consultas/${consulta.id}`, { method: 'DELETE' })
      onExcluida()
    })
  }

  return (
    <Modal
      title={consulta.paciente.nome}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost text-danger" onClick={excluir} disabled={salvando}>Excluir</button>
          <span className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || status === consulta.status}>Salvar</button>
        </>
      }
    >
      <dl className="details">
        <dt>Quando</dt>
        <dd>{fmtFullDay.format(consulta.start)}, {fmtTime.format(consulta.start)} – {fmtTime.format(consulta.end)}</dd>
        <dt>Profissional</dt>
        <dd><i className="dot" style={{ background: consulta.profissional.cor }} /> {consulta.profissional.nome}</dd>
        <dt>Procedimento</dt>
        <dd>{consulta.procedimento}</dd>
        <dt>Telefone</dt>
        <dd>{fmtTelefone(consulta.paciente.telefone)}</dd>
        <dt>Status</dt>
        <dd>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusConsulta)}>
            {/* Remarcada só pelo fluxo de remarcação (cria a nova consulta) */}
            {Object.entries(statusLabel)
              .filter(([k]) => k !== 'remarcada' || consulta.status === 'remarcada')
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </dd>
      </dl>
      {erro && <p className="text-danger small">{erro}</p>}
    </Modal>
  )
}
