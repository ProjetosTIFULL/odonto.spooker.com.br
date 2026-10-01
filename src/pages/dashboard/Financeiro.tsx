import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, DollarSign, Receipt, UserX } from 'lucide-react'
import { Card } from '../../components/ui'
import { ColumnChart, HBarChart, StatTile, brl } from '../../components/charts'
import { api } from '../../lib/api'

type FinanceiroApi = {
  data: string
  diasCorridos: number
  realizadoMes: number
  consultasConcluidasMes: number
  realizadoMesAnterior: number
  realizadoMesAnteriorMesmoPeriodo: number
  variacaoMesmoPeriodo: number | null
  previstoRestanteMes: number
  consultasPrevistasMes: number
  ticketMedio: number
  perdaFaltasMes: number
  faltasMes: number
  ultimosMeses: { mes: string; valor: number; consultas: number }[]
  porProfissional: { id: string; nome: string; cor: string; valor: number; consultas: number }[]
  porProcedimento: { id: string | null; nome: string; valor: number; consultas: number }[]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const nomeMes = (ym: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', opts)
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const consultas = (n: number) => `${n} consulta${n === 1 ? '' : 's'}`

export default function Financeiro() {
  const hoje = useMemo(() => new Date(), [])
  // Mês de referência: o atual ou um dos 5 anteriores (útil no começo do mês, quando o atual ainda está vazio)
  const meses = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        const fim = i === 0 ? hoje : new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 0)
        return { valor: iso(fim), rotulo: nomeMes(iso(ini).slice(0, 7)), atual: i === 0 }
      }),
    [hoje],
  )
  const [ref, setRef] = useState(meses[0].valor)
  const [d, setD] = useState<FinanceiroApi | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true)
    api<FinanceiroApi>(`/dashboard/financeiro?data=${ref}`)
      .then((r) => {
        setD(r)
        setErro(null)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [ref])

  if (erro) return <div className="alerta">{erro}</div>
  if (!d) return <p className="muted">Carregando financeiro...</p>

  const mesAtual = meses.find((m) => m.valor === ref)?.atual ?? false
  const mesRef = nomeMes(d.data.slice(0, 7))
  const mesAnteriorCurto = nomeMes(d.ultimosMeses[4].mes, { month: 'long' })

  return (
    // Mantém o desenho anterior (esmaecido) enquanto recarrega: sem pulo de layout
    <section className={`stack ${carregando ? 'is-recarregando' : ''}`} aria-label="Financeiro" aria-busy={carregando}>
      <div className="secao-cabecalho">
        <span className="muted small">Valores das consultas concluídas{mesAtual ? ' até hoje' : ''}</span>
        <label className="filtro-inline">
          <CalendarRange size={16} aria-hidden />
          <span className="sr-only">Mês de referência</span>
          <select className="input" value={ref} onChange={(e) => setRef(e.target.value)}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}{m.atual ? ' (atual)' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="kpi-grid">
        <StatTile
          icon={<DollarSign size={20} />}
          label={mesAtual ? 'Realizado no mês (até hoje)' : 'Realizado no mês'}
          value={brl(d.realizadoMes)}
          delta={
            mesAtual && d.variacaoMesmoPeriodo !== null
              ? { valor: d.variacaoMesmoPeriodo, texto: d.diasCorridos === 1 ? `vs 1º de ${mesAnteriorCurto}` : `vs 1º a ${d.diasCorridos} de ${mesAnteriorCurto}` }
              : !mesAtual && d.realizadoMesAnterior
                ? { valor: (d.realizadoMes - d.realizadoMesAnterior) / d.realizadoMesAnterior, texto: `vs ${mesAnteriorCurto}` }
                : null
          }
          hint={`${consultas(d.consultasConcluidasMes)} concluída${d.consultasConcluidasMes === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={<CalendarRange size={20} />}
          label="Previsto até o fim do mês"
          value={mesAtual ? brl(d.previstoRestanteMes) : '—'}
          hint={mesAtual ? `${consultas(d.consultasPrevistasMes)} agendada${d.consultasPrevistasMes === 1 ? '' : 's'}` : 'mês encerrado'}
        />
        <StatTile icon={<Receipt size={20} />} label="Ticket médio" value={brl(d.ticketMedio)} hint="por consulta concluída" />
        <StatTile
          icon={<UserX size={20} />}
          label="Perdido com faltas"
          value={brl(d.perdaFaltasMes)}
          hint={`${d.faltasMes} falta${d.faltasMes === 1 ? '' : 's'} no mês`}
        />
      </div>

      <div className="fin-grid">
        <Card title="Faturamento realizado · últimos 6 meses">
          <ColumnChart
            dados={d.ultimosMeses.map((m, i) => ({
              chave: m.mes,
              rotulo: nomeMes(m.mes, { month: 'short' }).replace('.', ''),
              titulo: capitalizar(`${nomeMes(m.mes)}${i === 5 && mesAtual ? ' (parcial)' : ''}`),
              valor: m.valor,
              detalhe: consultas(m.consultas),
            }))}
          />
          <p className="muted small">Consultas concluídas. {mesAtual ? 'O mês atual é parcial.' : ''}</p>
        </Card>
        <Card title={`Por profissional · ${mesRef}`}>
          <HBarChart
            dados={d.porProfissional.map((p) => ({ chave: p.id, rotulo: p.nome, valor: p.valor, cor: p.cor, detalhe: consultas(p.consultas) }))}
          />
        </Card>
        <Card title={`Por procedimento · ${mesRef}`}>
          <HBarChart
            vazio="Nenhuma consulta concluída no período."
            dados={d.porProcedimento.slice(0, 6).map((p) => ({ chave: p.id ?? 'sem', rotulo: p.nome, valor: p.valor, detalhe: consultas(p.consultas) }))}
          />
        </Card>
      </div>
    </section>
  )
}
