import { useEffect, useState } from 'react'
import { CalendarCheck2, MessageSquareQuote, Star, Stethoscope, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Card } from '../../components/ui'
import { HBarChart, StatTile, pct } from '../../components/charts'
import { api } from '../../lib/api'

type Avaliacao = {
  id: string
  nota: number
  comentario: string
  data: string
  paciente: string
  dentista: string
  cor: string
  procedimento: string
}

type DesempenhoApi = {
  dias: number
  atendimentos: number
  faltas: number
  comparecimento: number | null
  notaMedia: number | null
  avaliacoes: number
  taxaResposta: number | null
  porDentista: {
    id: string
    nome: string
    cor: string
    especialidade: string | null
    atendimentos: number
    faltas: number
    remarcadas: number
    canceladas: number
    comparecimento: number | null
    notaMedia: number | null
    avaliacoes: number
    distribuicao: number[] // quantidade de notas 1..5
    procedimentoMaisFeito: { nome: string; qtd: number } | null
  }[]
  procedimentos: { id: string; nome: string; qtd: number; media: number | null; avaliacoes: number }[]
  melhoresAvaliacoes: Avaliacao[]
  pontosDeAtencao: Avaliacao[]
}

const PERIODOS = [30, 90, 180] as const
const nota = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const qtd = (n: number) => n.toLocaleString('pt-BR')
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Estrelas preenchidas proporcionalmente (4,6 → 4 cheias + 60% da quinta). O número sempre aparece ao lado. */
function Estrelas({ valor, tamanho = 14 }: { valor: number | null; tamanho?: number }) {
  if (valor === null) return <span className="muted">sem avaliações</span>
  return (
    <span className="estrelas" role="img" aria-label={`nota ${nota(valor)} de 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const preenchido = Math.max(0, Math.min(1, valor - i))
        return (
          <span key={i} className="estrela" style={{ width: tamanho, height: tamanho }}>
            <Star size={tamanho} className="estrela-fundo" aria-hidden />
            <span className="estrela-cheia" style={{ width: `${preenchido * 100}%` }}>
              <Star size={tamanho} aria-hidden />
            </span>
          </span>
        )
      })}
    </span>
  )
}

export default function Desempenho() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30)
  const [d, setD] = useState<DesempenhoApi | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true)
    api<DesempenhoApi>(`/dashboard/desempenho?dias=${dias}`)
      .then((r) => {
        setD(r)
        setErro(null)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [dias])

  if (erro) return <div className="alerta">{erro}</div>
  if (!d) return <p className="muted">Carregando desempenho...</p>

  const maxAtend = Math.max(...d.porDentista.map((p) => p.atendimentos), 1)

  return (
    <section className={`stack ${carregando ? 'is-recarregando' : ''}`} aria-label="Desempenho" aria-busy={carregando}>
      <div className="secao-cabecalho">
        <span className="muted small">Consultas e avaliações dos últimos {d.dias} dias</span>
        <div className="segmented" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p} className={dias === p ? 'active' : ''} aria-pressed={dias === p} onClick={() => setDias(p)}>
              {p === 180 ? '6 meses' : `${p} dias`}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <StatTile icon={<Stethoscope size={20} />} label="Atendimentos realizados" value={qtd(d.atendimentos)} hint={`${d.faltas} falta${d.faltas === 1 ? '' : 's'} no período`} />
        <StatTile
          icon={<CalendarCheck2 size={20} />}
          label="Comparecimento"
          value={d.comparecimento === null ? '—' : pct(d.comparecimento)}
          hint="realizadas ÷ (realizadas + faltas)"
        />
        <StatTile
          icon={<Star size={20} />}
          label="Nota média pós-consulta"
          value={
            <span className="nota-destaque">
              {nota(d.notaMedia)} <Estrelas valor={d.notaMedia} />
            </span>
          }
          hint={`${qtd(d.avaliacoes)} avaliações`}
        />
        <StatTile
          icon={<MessageSquareQuote size={20} />}
          label="Taxa de resposta"
          value={d.taxaResposta === null ? '—' : pct(d.taxaResposta)}
          hint="pacientes que avaliaram"
        />
      </div>

      <Card title="Por dentista">
        <div className="table-wrap">
          <table className="table desempenho-tabela">
            <thead>
              <tr>
                <th>Dentista</th>
                <th>Atendimentos</th>
                <th>Comparecimento</th>
                <th>Nota média</th>
                <th>Notas 5★ / até 3★</th>
                <th>Faltas · remarcadas</th>
                <th>Mais realizado</th>
              </tr>
            </thead>
            <tbody>
              {d.porDentista.map((p) => {
                const cinco = p.distribuicao[4]
                const baixas = p.distribuicao[0] + p.distribuicao[1] + p.distribuicao[2]
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-user">
                        <i className="dot" style={{ background: p.cor }} aria-hidden />
                        <div className="cell-stack">
                          <strong>{p.nome}</strong>
                          {p.especialidade && <small className="muted">{p.especialidade}</small>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {/* número + barra fina proporcional ao maior do período */}
                      <div className="inline-bar">
                        <strong>{qtd(p.atendimentos)}</strong>
                        <span className="inline-bar-track"><span style={{ width: `${(p.atendimentos / maxAtend) * 100}%` }} /></span>
                      </div>
                    </td>
                    <td>{p.comparecimento === null ? '—' : pct(p.comparecimento)}</td>
                    <td>
                      <div className="cell-stack">
                        <span className="nota-linha">
                          <strong>{nota(p.notaMedia)}</strong> <Estrelas valor={p.notaMedia} tamanho={12} />
                        </span>
                        <small className="muted">{qtd(p.avaliacoes)} avaliações</small>
                      </div>
                    </td>
                    <td>
                      {p.avaliacoes ? (
                        <span>
                          {pct(cinco / p.avaliacoes)} <span className="muted">/</span>{' '}
                          <span className={baixas / p.avaliacoes >= 0.15 ? 'text-danger' : ''}>{pct(baixas / p.avaliacoes)}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {p.faltas} · {p.remarcadas}
                    </td>
                    <td>
                      {p.procedimentoMaisFeito ? (
                        <div className="cell-stack">
                          <span>{p.procedimentoMaisFeito.nome}</span>
                          <small className="muted">{p.procedimentoMaisFeito.qtd}×</small>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">“Até 3★” em vermelho quando passa de 15% das avaliações do dentista.</p>
      </Card>

      <div className="desempenho-grid">
        <Card title="Procedimentos mais realizados">
          <HBarChart
            vazio="Nenhum atendimento no período."
            formatar={(v) => `${qtd(v)}×`}
            formatarCompleto={(v) => `${qtd(v)} atendimento${v === 1 ? '' : 's'}`}
            dados={d.procedimentos.slice(0, 8).map((p) => ({
              chave: p.id,
              rotulo: p.nome,
              valor: p.qtd,
              detalhe: p.media === null ? 'sem avaliações' : `nota ${nota(p.media)}`,
            }))}
          />
        </Card>

        <Card title="Melhores avaliações">
          <ListaAvaliacoes itens={d.melhoresAvaliacoes} vazio="Nenhuma avaliação 5★ com comentário no período." icone={<ThumbsUp size={14} aria-hidden />} />
        </Card>

        <Card title="Pontos de atenção">
          <ListaAvaliacoes itens={d.pontosDeAtencao} vazio="Nenhuma avaliação de 3★ ou menos com comentário." icone={<ThumbsDown size={14} aria-hidden />} />
        </Card>
      </div>
    </section>
  )
}

function ListaAvaliacoes({ itens, vazio, icone }: { itens: Avaliacao[]; vazio: string; icone: React.ReactNode }) {
  if (!itens.length) return <p className="muted small">{vazio}</p>
  return (
    <ul className="avaliacoes">
      {itens.map((a) => (
        <li key={a.id}>
          <div className="avaliacao-topo">
            <Estrelas valor={a.nota} tamanho={12} />
            <small className="muted">{dataCurta(a.data)}</small>
          </div>
          <blockquote>
            {icone} “{a.comentario}”
          </blockquote>
          <small className="muted">
            {a.paciente} · <i className="dot" style={{ background: a.cor }} aria-hidden /> {a.dentista} · {a.procedimento}
          </small>
        </li>
      ))}
    </ul>
  )
}
