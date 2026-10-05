import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Cake,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  UserX,
} from 'lucide-react'
import { Card, Modal, StatusBadge } from '../../components/ui'
import { StatTile, pct } from '../../components/charts'
import type { StatusConsulta } from '../../data/mock'
import { api } from '../../lib/api'

type ConsultaResumo = {
  id: string
  inicio: string
  fim: string
  status: string
  paciente: { id: string; nome: string; telefone: string }
  profissional: { id: string; nome: string; cor: string }
  procedimento: { id: string; nome: string } | null
}

type RotinaApi = {
  consultasHoje: number
  confirmadasHoje: number
  faltasHoje: number
  taxaConfirmacao: number
  pacientesSemRetorno: number
  novosPacientesMes: number
  agendaHoje: ConsultaResumo[]
  aConfirmarAmanha: ConsultaResumo[]
  pendentesBaixa: ConsultaResumo[]
  aniversariantes: { id: string; nome: string; telefone: string; nascimento: string }[]
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtTelefone = (t: string) => {
  const m = t.replace(/^55/, '').match(/^(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t
}
const statusUi = (s: string) => s.toLowerCase() as StatusConsulta
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Rotina() {
  const [d, setD] = useState<RotinaApi | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [baixa, setBaixa] = useState<ConsultaResumo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviandoParabens, setEnviandoParabens] = useState<string | null>(null)

  const enviarParabens = async (p: { id: string; nome: string; telefone: string }) => {
    setEnviandoParabens(p.id)
    try {
      const conversa = await api<{ id: string }>('/conversas', { method: 'POST', body: { telefone: p.telefone, nomeContato: p.nome } })
      const texto = `Parabéns, ${p.nome.split(' ')[0]}! 🎉 A equipe deseja a você um dia maravilhoso e um ano repleto de saúde e sorrisos!`
      const r = await api<{ avisoEnvio: string | null }>(`/conversas/${conversa.id}/mensagens`, { method: 'POST', body: { texto } })
      setAviso(r.avisoEnvio ? `Não foi possível enviar pra ${p.nome}: ${r.avisoEnvio}` : `Mensagem de parabéns enviada para ${p.nome}.`)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setEnviandoParabens(null)
    }
  }

  const carregar = useCallback(() => {
    api<RotinaApi>('/dashboard/rotina').then(setD).catch((e) => setErro(e.message))
  }, [])
  useEffect(carregar, [carregar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  if (erro) return <div className="alerta">{erro}</div>
  if (!d) return <p className="muted">Carregando rotina...</p>

  const pendencias = d.pendentesBaixa.length + d.aConfirmarAmanha.length

  return (
    <section className="stack rotina" aria-label="Rotina">
      {aviso && <div className="toast" role="status">{aviso}</div>}

      <div className="kpi-grid kpi-grid-3">
        <StatTile
          icon={<CalendarDays size={20} />}
          label="Consultas hoje"
          value={d.consultasHoje}
          hint={`${d.confirmadasHoje} confirmadas${d.faltasHoje ? ` · ${d.faltasHoje} falta${d.faltasHoje > 1 ? 's' : ''}` : ''}`}
        />
        <StatTile icon={<CalendarCheck size={20} />} label="Taxa de confirmação" value={pct(d.taxaConfirmacao)} hint="consultas de hoje" />
        <StatTile icon={<CalendarClock size={20} />} label="A confirmar amanhã" value={d.aConfirmarAmanha.length} hint="ainda sem confirmação" />
      </div>

      {/* Linha 1: o trabalho do dia. Os dois cards ficam da mesma altura (sem buraco embaixo) */}
      <div className="rotina-linha rotina-linha-1">
        <Card title="Agenda de hoje" action={<Link to="/agenda" className="link">Ver agenda</Link>}>
          {d.agendaHoje.length === 0 && <p className="muted small">Nenhuma consulta hoje.</p>}
          <ul className="list">
            {d.agendaHoje.map((c) => (
              <li key={c.id} className="list-row">
                <span className="time">{hora(c.inicio)}</span>
                <span className="prof-bar" style={{ background: c.profissional.cor }} />
                <div className="grow">
                  <strong>{c.paciente.nome}</strong>
                  <small>{c.procedimento?.nome ?? 'Consulta'} · {c.profissional.nome}</small>
                </div>
                <StatusBadge status={statusUi(c.status)} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Pendências${pendencias ? ` (${pendencias})` : ''}`}>
          {pendencias === 0 && <p className="muted small">Tudo em dia.</p>}
          {d.pendentesBaixa.length > 0 && (
            <>
              <h3 className="sub-titulo"><AlertTriangle size={14} className="inline-icon text-warning" /> Dar baixa (horário já passou)</h3>
              <ul className="list">
                {d.pendentesBaixa.map((c) => (
                  <li key={c.id} className="list-row">
                    <div className="grow">
                      <strong>{c.paciente.nome}</strong>
                      <small>{diaHora(c.inicio)} · {c.profissional.nome}</small>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setBaixa(c)}>Dar baixa</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.aConfirmarAmanha.length > 0 && (
            <>
              <h3 className="sub-titulo"><CalendarClock size={14} className="inline-icon" /> Confirmar consultas de amanhã</h3>
              <ul className="list">
                {d.aConfirmarAmanha.map((c) => (
                  <li key={c.id} className="list-row">
                    <span className="time">{hora(c.inicio)}</span>
                    <div className="grow">
                      <strong>{c.paciente.nome}</strong>
                      <small>{fmtTelefone(c.paciente.telefone)} · {c.profissional.nome}</small>
                    </div>
                    <Link to="/chat" className="icon-btn" title="Confirmar pelo WhatsApp" aria-label={`Confirmar ${c.paciente.nome} pelo WhatsApp`}>
                      <MessageCircle size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Linha 2: relacionamento com pacientes, dois cards da mesma altura */}
      <div className="rotina-linha rotina-linha-2">
        <Card title="Aniversariantes do mês">
          {d.aniversariantes.length === 0 && <p className="muted small">Nenhum aniversariante este mês.</p>}
          <ul className="list">
            {d.aniversariantes.map((p) => (
              <li key={p.id} className="list-row">
                <Cake size={18} className="muted" />
                <div className="grow">
                  <strong>{p.nome}</strong>
                  <small>{p.nascimento.slice(8, 10)}/{p.nascimento.slice(5, 7)}</small>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={enviandoParabens === p.id}
                  onClick={() => enviarParabens(p)}
                >
                  {enviandoParabens === p.id ? 'Enviando...' : 'Enviar parabéns'}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Pacientes">
          <ul className="list">
            <li className="list-row">
              <UserPlus size={18} className="muted" />
              <div className="grow">
                <strong>{d.novosPacientesMes} novo(s) no mês</strong>
              </div>
            </li>
            <li className="list-row">
              <UserX size={18} className={d.pacientesSemRetorno ? 'text-danger' : 'muted'} />
              <div className="grow">
                <strong>{d.pacientesSemRetorno} sem retorno há mais de 6 meses</strong>
                {d.pacientesSemRetorno > 0 && <small>Sugestão: campanha de retorno via WhatsApp</small>}
              </div>
            </li>
          </ul>
        </Card>
      </div>

      {baixa && (
        <DarBaixa
          consulta={baixa}
          onClose={() => setBaixa(null)}
          onFeito={(msg) => {
            setBaixa(null)
            setAviso(msg)
            carregar()
          }}
        />
      )}
    </section>
  )
}

type Resultado = 'realizada' | 'faltou' | 'remarcou'

const OPCOES: { id: Resultado; titulo: string; descricao: string; icon: typeof UserX }[] = [
  { id: 'realizada', titulo: 'Consulta realizada', descricao: 'O paciente foi atendido.', icon: CheckCircle2 },
  { id: 'faltou', titulo: 'Faltou', descricao: 'Não compareceu e não remarcou.', icon: UserX },
  { id: 'remarcou', titulo: 'Remarcou', descricao: 'Escolha a nova data; a consulta nova vai para a agenda.', icon: CalendarClock },
]

/** Baixa da consulta que já passou: realizada (CONCLUIDA), faltou (FALTOU) ou remarcou (nova consulta + REMARCADA). */
function DarBaixa({ consulta, onClose, onFeito }: { consulta: ConsultaResumo; onClose: () => void; onFeito: (msg: string) => void }) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // Sugestão para remarcar: amanhã, no mesmo horário
  const [data, setData] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return isoLocal(d)
  })
  const [horaNova, setHoraNova] = useState(hora(consulta.inicio))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const confirmar = async () => {
    if (!resultado) return
    setErro(null)
    setSalvando(true)
    try {
      if (resultado === 'remarcou') {
        const inicio = new Date(`${data}T${horaNova}:00`)
        if (Number.isNaN(inicio.getTime()) || inicio < new Date()) throw new Error('Escolha uma data e hora futuras.')
        await api(`/consultas/${consulta.id}/remarcar`, { method: 'POST', body: { inicio: inicio.toISOString() } })
        onFeito(`${consulta.paciente.nome}: remarcada para ${inicio.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`)
      } else {
        await api(`/consultas/${consulta.id}/status`, { method: 'PATCH', body: { status: resultado === 'realizada' ? 'CONCLUIDA' : 'FALTOU' } })
        onFeito(`${consulta.paciente.nome}: ${resultado === 'realizada' ? 'consulta realizada' : 'falta registrada'}.`)
      }
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal
      title="Dar baixa na consulta"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={!resultado || salvando}>
            {salvando ? 'Salvando...' : 'Confirmar baixa'}
          </button>
        </>
      }
    >
      <div className="baixa-resumo">
        <strong>{consulta.paciente.nome}</strong>
        <small>
          {diaHora(consulta.inicio)} · {consulta.procedimento?.nome ?? 'Consulta'} · {consulta.profissional.nome}
        </small>
      </div>

      <div className="baixa-opcoes" role="radiogroup" aria-label="Resultado da consulta">
        {OPCOES.map(({ id, titulo, descricao, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={resultado === id}
            className={`baixa-opcao is-${id} ${resultado === id ? 'active' : ''}`}
            onClick={() => setResultado(id)}
          >
            <Icon size={22} aria-hidden />
            <span>
              <strong>{titulo}</strong>
              <small>{descricao}</small>
            </span>
          </button>
        ))}
      </div>

      {resultado === 'remarcou' && (
        <div className="form-grid baixa-remarcar">
          <label>Nova data<input type="date" className="input" value={data} min={isoLocal(new Date())} onChange={(e) => setData(e.target.value)} /></label>
          <label>Horário<input type="time" className="input" step={900} value={horaNova} onChange={(e) => setHoraNova(e.target.value)} /></label>
          <small className="muted span-2">Mesmo profissional, procedimento e duração. A consulta de hoje fica marcada como “Remarcada”.</small>
        </div>
      )}
      {erro && <p className="text-danger small">{erro}</p>}
    </Modal>
  )
}
