// Gráficos simples em HTML/CSS (sem biblioteca). Regras seguidas:
// barras finas (<= 24px) com ponta arredondada e base reta, uma cor só (ou destaque + cinza),
// valor escrito em todas as barras (nada depende de hover), texto sempre na cor de texto,
// tooltip no hover e no foco do teclado.

import { useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const brlCompacto = (v: number) =>
  v >= 10_000 ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }) : brl(v)
export const pct = (v: number) => `${Math.round(v * 100)}%`

// ---------- Stat tile ----------
export function StatTile({
  label,
  value,
  hint,
  delta,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** variação com sinal; `bomQuandoSobe` define a cor */
  delta?: { valor: number; texto: string; bomQuandoSobe?: boolean } | null
  icon?: ReactNode
}) {
  const tone = !delta || Math.abs(delta.valor) < 0.005 ? 'neutro' : (delta.valor > 0) === (delta.bomQuandoSobe ?? true) ? 'bom' : 'ruim'
  const Seta = !delta || tone === 'neutro' ? Minus : delta.valor > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="kpi stat">
      {icon && <div className="kpi-icon tone-teal">{icon}</div>}
      <div>
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {delta && (
          <span className={`stat-delta is-${tone}`}>
            <Seta size={14} aria-hidden />
            {delta.valor > 0 ? '+' : ''}
            {pct(delta.valor)} {delta.texto}
          </span>
        )}
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  )
}

// ---------- Tooltip compartilhado ----------
type Tip = { x: number; y: number; titulo: string; linhas: string[] } | null

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.linhas.map((l, i) => (i === 0 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>))}
      <small>{tip.titulo}</small>
    </div>
  )
}

// ---------- Colunas (série temporal curta) ----------
export type Coluna = { chave: string; rotulo: string; titulo: string; valor: number; detalhe?: string }

/** Colunas com a última em destaque (accent) e as anteriores em cinza. */
export function ColumnChart({ dados, destacarUltima = true, altura = 180 }: { dados: Coluna[]; destacarUltima?: boolean; altura?: number }) {
  const [tip, setTip] = useState<Tip>(null)
  const max = Math.max(...dados.map((d) => d.valor), 1)

  const mostrar = (el: HTMLElement, d: Coluna) => {
    const host = el.closest('.chart')!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, titulo: d.titulo, linhas: [brl(d.valor), ...(d.detalhe ? [d.detalhe] : [])] })
  }

  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <div className="cols" style={{ height: altura }}>
        {dados.map((d, i) => {
          const destaque = destacarUltima && i === dados.length - 1
          return (
            <div
              key={d.chave}
              className="col-band"
              tabIndex={0}
              aria-label={`${d.titulo}: ${brl(d.valor)}${d.detalhe ? `, ${d.detalhe}` : ''}`}
              onMouseEnter={(e) => mostrar(e.currentTarget.querySelector('.col-bar') as HTMLElement, d)}
              onFocus={(e) => mostrar(e.currentTarget.querySelector('.col-bar') as HTMLElement, d)}
              onBlur={() => setTip(null)}
            >
              <span className="col-valor">{brlCompacto(d.valor)}</span>
              <span className={`col-bar ${destaque ? 'is-destaque' : ''}`} style={{ height: `${(d.valor / max) * 100}%` }} />
            </div>
          )
        })}
      </div>
      <div className="cols-eixo">
        {dados.map((d) => <span key={d.chave}>{d.rotulo}</span>)}
      </div>
      <Tooltip tip={tip} />
    </div>
  )
}

// ---------- Barras horizontais (ranking) ----------
export type Barra = { chave: string; rotulo: string; valor: number; detalhe?: string; cor?: string }

/** Uma cor só para a barra; `cor` vira só um marcador ao lado do nome (identidade, não magnitude). */
export function HBarChart({
  dados,
  vazio = 'Sem dados no período.',
  formatar = brlCompacto,
  formatarCompleto = brl,
}: {
  dados: Barra[]
  vazio?: string
  /** Valor na ponta da barra (padrão: R$ compacto) */
  formatar?: (v: number) => string
  /** Valor no tooltip e no rótulo acessível (padrão: R$ completo) */
  formatarCompleto?: (v: number) => string
}) {
  const [tip, setTip] = useState<Tip>(null)
  const max = Math.max(...dados.map((d) => d.valor), 1)
  if (!dados.length) return <p className="muted small">{vazio}</p>

  const mostrar = (el: HTMLElement, d: Barra) => {
    const host = el.closest('.chart')!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setTip({ x: r.left - host.left + Math.max(r.width, 8) / 2, y: r.top - host.top, titulo: d.rotulo, linhas: [formatarCompleto(d.valor), ...(d.detalhe ? [d.detalhe] : [])] })
  }

  return (
    <div className="chart hbars" onMouseLeave={() => setTip(null)}>
      {dados.map((d) => (
        <div
          key={d.chave}
          className="hbar-row"
          tabIndex={0}
          aria-label={`${d.rotulo}: ${formatarCompleto(d.valor)}${d.detalhe ? `, ${d.detalhe}` : ''}`}
          onMouseEnter={(e) => mostrar(e.currentTarget.querySelector('.hbar') as HTMLElement, d)}
          onFocus={(e) => mostrar(e.currentTarget.querySelector('.hbar') as HTMLElement, d)}
          onBlur={() => setTip(null)}
        >
          {/* Nome e valor na linha de cima, barra embaixo com a largura toda: cabe em card estreito sem cortar texto */}
          <span className="hbar-topo">
            <span className="hbar-rotulo" title={d.rotulo}>
              {d.cor && <i style={{ background: d.cor }} aria-hidden />}
              {d.rotulo}
            </span>
            <span className="hbar-valor">
              {formatar(d.valor)}
              {d.detalhe && <small> · {d.detalhe}</small>}
            </span>
          </span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(d.valor / max) * 100}%` }} />
          </span>
        </div>
      ))}
      <Tooltip tip={tip} />
    </div>
  )
}
