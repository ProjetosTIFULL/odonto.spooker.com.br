// Calendário de eventos: visões mês, semana, dia, por recurso (profissional) e lista.
// Arrastar para mover, puxar a borda inferior para mudar a duração, clicar em horário vazio para criar.
// Os eventos são controlados pelo componente pai: o calendário só propõe mudanças via onEventChange.
// Inspirado na API do Event Calendar do ReUI, reescrito sem Tailwind/shadcn.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays,
  addMonths,
  atMinutes,
  fmtDayMonth,
  fmtFullDay,
  fmtListDay,
  fmtMonthYear,
  fmtTime,
  fmtWeekday,
  minutesLabel,
  minutesOfDay,
  overlaps,
  sameDay,
  startOfDay,
  startOfWeek,
} from './dates'

export type CalendarView = 'mes' | 'semana' | 'dia' | 'recursos' | 'lista'

export type CalendarEvent<T = unknown> = {
  id: string
  title: string
  subtitle?: string
  start: Date
  end: Date
  color?: string
  resourceId?: string
  /** Não pode ser arrastado nem redimensionado. */
  readOnly?: boolean
  className?: string
  data?: T
}

export type CalendarResource = { id: string; title: string; color?: string }

export type EventChange<T> = { event: CalendarEvent<T>; start: Date; end: Date; resourceId?: string }

export type SlotInfo = { start: Date; end: Date; resourceId?: string }

type Props<T> = {
  events: CalendarEvent<T>[]
  resources?: CalendarResource[]
  views?: CalendarView[]
  defaultView?: CalendarView
  defaultDate?: Date
  dayStartHour?: number
  dayEndHour?: number
  /** Tamanho da linha da grade e duração padrão ao clicar num horário vazio. */
  slotMinutes?: number
  /** Arredondamento ao arrastar/redimensionar. */
  snapMinutes?: number
  hourHeight?: number
  weekStartsOn?: 0 | 1
  /** Dias da semana (0 = domingo) ocultos nas visões mês/semana. */
  hiddenWeekdays?: number[]
  /** Pinta horários fora do expediente. */
  isClosed?: (day: Date, minutes: number) => boolean
  onEventClick?: (event: CalendarEvent<T>) => void
  onSlotClick?: (slot: SlotInfo) => void
  onEventChange?: (change: EventChange<T>) => void
  renderEvent?: (event: CalendarEvent<T>, info: { compact: boolean }) => ReactNode
  /** Conteúdo extra à direita da barra (filtros, botão "novo"). */
  toolbarExtra?: ReactNode
}

const VIEW_LABEL: Record<CalendarView, string> = {
  mes: 'Mês',
  semana: 'Semana',
  dia: 'Dia',
  recursos: 'Profissionais',
  lista: 'Lista',
}

const LISTA_DIAS = 30

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const DRAG_THRESHOLD_PX = 4

type Column = { key: string; day: Date; resourceId?: string; header: ReactNode }

type DragState<T> = {
  mode: 'move' | 'resize'
  event: CalendarEvent<T>
  x: number
  y: number
  /** Minutos entre o início do evento e o ponto em que foi agarrado. */
  grabOffset: number
  active: boolean
}

type Preview = { id: string; start: Date; end: Date; resourceId?: string }

export default function EventCalendar<T>({
  events,
  resources = [],
  views = resources.length ? ['mes', 'semana', 'dia', 'recursos', 'lista'] : ['mes', 'semana', 'dia', 'lista'],
  defaultView = 'semana',
  defaultDate,
  dayStartHour = 7,
  dayEndHour = 20,
  slotMinutes = 30,
  snapMinutes = 15,
  hourHeight = 64,
  weekStartsOn = 1,
  hiddenWeekdays = [],
  isClosed,
  onEventClick,
  onSlotClick,
  onEventChange,
  renderEvent,
  toolbarExtra,
}: Props<T>) {
  const [view, setView] = useState<CalendarView>(defaultView)
  const [date, setDate] = useState(() => startOfDay(defaultDate ?? new Date()))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [now, setNow] = useState(() => new Date())

  const drag = useRef<DragState<T> | null>(null)
  const justDragged = useRef(false)
  /** Onde o último clique começou: um "clique" que terminou longe foi um arraste, não abre horário. */
  const downAt = useRef({ x: 0, y: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)

  const pxPerMin = hourHeight / 60
  const minMin = dayStartHour * 60
  const maxMin = dayEndHour * 60
  const snap = (m: number) => Math.round(m / snapMinutes) * snapMinutes
  const wasDrag = (e: React.MouseEvent) => Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) >= DRAG_THRESHOLD_PX

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Grade de horários abre rolada até uma hora antes de agora
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = Math.max(0, (minutesOfDay(new Date()) - minMin - 60) * pxPerMin)
  }, [view, minMin, pxPerMin])

  // ---------- Navegação ----------
  const step = (dir: number) => {
    if (view === 'mes') setDate((d) => addMonths(d, dir))
    else if (view === 'semana') setDate((d) => addDays(d, 7 * dir))
    else if (view === 'lista') setDate((d) => addDays(d, LISTA_DIAS * dir))
    else setDate((d) => addDays(d, dir))
  }

  const weekDays = useMemo(() => {
    const ini = startOfWeek(date, weekStartsOn)
    return Array.from({ length: 7 }, (_, i) => addDays(ini, i)).filter((d) => !hiddenWeekdays.includes(d.getDay()))
  }, [date, weekStartsOn, hiddenWeekdays])

  const title = capitalize((() => {
    if (view === 'mes') return fmtMonthYear.format(date)
    if (view === 'semana') {
      const a = weekDays[0]
      const b = weekDays[weekDays.length - 1]
      return `${fmtDayMonth.format(a)} – ${fmtDayMonth.format(b)} ${b.getFullYear()}`
    }
    if (view === 'lista') return `${fmtDayMonth.format(date)} – ${fmtDayMonth.format(addDays(date, LISTA_DIAS - 1))}`
    return fmtFullDay.format(date)
  })())

  // Evento com a posição do arraste aplicada (para desenhar a prévia no lugar certo)
  const effective = (e: CalendarEvent<T>): CalendarEvent<T> =>
    preview?.id === e.id ? { ...e, start: preview.start, end: preview.end, resourceId: preview.resourceId ?? e.resourceId } : e

  // ---------- Arrastar / redimensionar ----------
  function hitTest(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const col = el?.closest<HTMLElement>('[data-ec-col]')
    if (col) {
      const rect = col.getBoundingClientRect()
      return {
        kind: 'time' as const,
        day: new Date(Number(col.dataset.day)),
        resourceId: col.dataset.resource || undefined,
        minutes: minMin + (y - rect.top) / pxPerMin,
      }
    }
    const cell = el?.closest<HTMLElement>('[data-ec-cell]')
    if (cell) return { kind: 'month' as const, day: new Date(Number(cell.dataset.day)) }
    return null
  }

  function computePreview(d: DragState<T>, x: number, y: number): Preview | null {
    const hit = hitTest(x, y)
    if (!hit) return null
    const { event } = d
    const duration = event.end.getTime() - event.start.getTime()

    if (hit.kind === 'month') {
      const start = atMinutes(hit.day, minutesOfDay(event.start))
      return { id: event.id, start, end: new Date(start.getTime() + duration), resourceId: event.resourceId }
    }

    if (d.mode === 'resize') {
      const startMin = minutesOfDay(event.start)
      const endMin = Math.min(maxMin, Math.max(startMin + snapMinutes, snap(hit.minutes)))
      return { id: event.id, start: event.start, end: atMinutes(startOfDay(event.start), endMin), resourceId: event.resourceId }
    }

    const durMin = duration / 60_000
    const startMin = Math.min(maxMin - durMin, Math.max(minMin, snap(hit.minutes - d.grabOffset)))
    const start = atMinutes(hit.day, startMin)
    return {
      id: event.id,
      start,
      end: new Date(start.getTime() + duration),
      resourceId: view === 'recursos' ? hit.resourceId : event.resourceId,
    }
  }

  function beginDrag(e: React.PointerEvent, event: CalendarEvent<T>, mode: DragState<T>['mode']) {
    if (e.button !== 0 || event.readOnly || !onEventChange) return
    e.stopPropagation()
    e.preventDefault() // sem seleção de texto nem arraste nativo do navegador
    const hit = hitTest(e.clientX, e.clientY)
    const grabOffset = hit?.kind === 'time' ? hit.minutes - minutesOfDay(event.start) : 0
    drag.current = { mode, event, x: e.clientX, y: e.clientY, grabOffset, active: false }
    const pointer = { x: e.clientX, y: e.clientY }
    let raf = 0

    // Rola a grade quando o ponteiro chega perto da borda, mesmo parado
    const autoScroll = () => {
      const d = drag.current
      const el = scrollRef.current
      if (!d || !el) return
      const r = el.getBoundingClientRect()
      const head = el.querySelector('.ec-tg-head')?.getBoundingClientRect().height ?? 0
      const EDGE = 48
      let dy = 0
      if (pointer.y > r.bottom - EDGE) dy = Math.min(EDGE, pointer.y - (r.bottom - EDGE))
      else if (pointer.y < r.top + head + EDGE) dy = -Math.min(EDGE, r.top + head + EDGE - pointer.y)
      if (dy && d.active) {
        const antes = el.scrollTop
        el.scrollTop += dy / 3
        if (el.scrollTop !== antes) {
          const p = computePreview(d, pointer.x, Math.min(Math.max(pointer.y, r.top + head + 1), r.bottom - 1))
          if (p) setPreview(p)
        }
      }
      raf = requestAnimationFrame(autoScroll)
    }
    raf = requestAnimationFrame(autoScroll)

    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      pointer.x = ev.clientX
      pointer.y = ev.clientY
      if (!d.active && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < DRAG_THRESHOLD_PX) return
      d.active = true
      const p = computePreview(d, ev.clientX, ev.clientY)
      if (p) setPreview(p)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cancelAnimationFrame(raf)
    }

    // O navegador pode cancelar o gesto (rolagem, arraste nativo): descarta sem alterar nada
    const cancel = () => {
      cleanup()
      drag.current = null
      setPreview(null)
    }

    const up = (ev: PointerEvent) => {
      cleanup()
      const d = drag.current
      drag.current = null
      setPreview(null)
      if (!d?.active) return
      // Ignora o "click" que o navegador dispara logo após soltar; depois libera
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
      const p = computePreview(d, ev.clientX, ev.clientY)
      const changed =
        p &&
        (p.start.getTime() !== d.event.start.getTime() ||
          p.end.getTime() !== d.event.end.getTime() ||
          p.resourceId !== d.event.resourceId)
      if (changed) onEventChange?.({ event: d.event, start: p.start, end: p.end, resourceId: p.resourceId })
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const clickEvent = (e: React.MouseEvent, event: CalendarEvent<T>) => {
    e.stopPropagation()
    if (justDragged.current || wasDrag(e)) return
    onEventClick?.(event)
  }

  const defaultRender = (ev: CalendarEvent<T>, compact: boolean) => (
    <>
      <strong>{ev.title}</strong>
      {!compact && (
        <small>
          {fmtTime.format(ev.start)}
          {ev.subtitle ? ` · ${ev.subtitle}` : ''}
        </small>
      )}
    </>
  )
  const render = (ev: CalendarEvent<T>, compact: boolean) => (renderEvent ? renderEvent(ev, { compact }) : defaultRender(ev, compact))

  // ---------- Visões com grade de horários (semana, dia, recursos) ----------
  function renderTimeGrid(columns: Column[]) {
    const hours = Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i)
    const slots = Array.from({ length: ((dayEndHour - dayStartHour) * 60) / slotMinutes }, (_, i) => minMin + i * slotMinutes)
    const template = { gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }
    const nowMin = minutesOfDay(now)

    return (
      <div className="ec-scroll" ref={scrollRef}>
        <div className="ec-tg-head" style={template}>
          <div />
          {columns.map((c) => (
            <div key={c.key} className={`ec-col-head ${sameDay(c.day, now) && view !== 'recursos' ? 'is-today' : ''}`}>
              {c.header}
            </div>
          ))}
        </div>

        <div className="ec-tg-body" style={template}>
          <div className="ec-gutter">
            {hours.map((h) => (
              <div key={h} style={{ height: hourHeight }}>{minutesLabel(h * 60)}</div>
            ))}
          </div>

          {columns.map((c) => {
            const dayStart = c.day
            const dayEnd = addDays(dayStart, 1)
            const colEvents = events
              .map(effective)
              .filter((e) => overlaps(e.start, e.end, dayStart, dayEnd) && (c.resourceId === undefined || e.resourceId === c.resourceId))
            const lanes = layoutLanes(colEvents)

            return (
              <div
                key={c.key}
                className="ec-col"
                data-ec-col
                data-day={dayStart.getTime()}
                data-resource={c.resourceId ?? ''}
                style={{ height: hours.length * hourHeight }}
                onClick={(e) => {
                  if (!onSlotClick || wasDrag(e)) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const m = minMin + Math.floor((e.clientY - rect.top) / pxPerMin / slotMinutes) * slotMinutes
                  onSlotClick({ start: atMinutes(dayStart, m), end: atMinutes(dayStart, m + slotMinutes), resourceId: c.resourceId })
                }}
              >
                {slots.map((m) => (
                  <div
                    key={m}
                    className={`ec-slot ${m % 60 === 0 ? 'is-hour' : ''} ${isClosed?.(dayStart, m) ? 'is-closed' : ''} ${atMinutes(dayStart, m + slotMinutes) <= now ? 'is-past' : ''}`}
                    style={{ height: slotMinutes * pxPerMin }}
                  />
                ))}

                {colEvents.map((ev) => {
                  const s = Math.max(minMin, sameDay(ev.start, dayStart) ? minutesOfDay(ev.start) : 0)
                  const f = Math.min(maxMin, sameDay(ev.end, dayStart) ? minutesOfDay(ev.end) : 24 * 60)
                  if (f <= minMin || s >= maxMin) return null
                  const { lane, lanes: total } = lanes.get(ev.id)!
                  const height = (f - s) * pxPerMin
                  const dragging = preview?.id === ev.id
                  return (
                    <div
                      key={ev.id}
                      className={`ec-event ${ev.className ?? ''} ${dragging ? 'is-dragging' : ''} ${ev.readOnly ? 'is-readonly' : ''}`}
                      style={{
                        top: (s - minMin) * pxPerMin,
                        height: Math.max(height, 18),
                        left: `calc(${(lane / total) * 100}% + 2px)`,
                        width: `calc(${100 / total}% - 4px)`,
                        borderLeftColor: ev.color,
                      }}
                      title={`${fmtTime.format(ev.start)}–${fmtTime.format(ev.end)} · ${ev.title}${ev.subtitle ? ` · ${ev.subtitle}` : ''}`}
                      onPointerDown={(e) => beginDrag(e, ev, 'move')}
                    onDragStart={(e) => e.preventDefault()}
                      onClick={(e) => clickEvent(e, ev)}
                    >
                      {render(ev, height < 40)}
                      {dragging && <span className="ec-drag-time">{fmtTime.format(ev.start)} – {fmtTime.format(ev.end)}</span>}
                      {!ev.readOnly && onEventChange && (
                        <span className="ec-resize" onPointerDown={(e) => beginDrag(e, ev, 'resize')} />
                      )}
                    </div>
                  )
                })}

                {sameDay(dayStart, now) && nowMin >= minMin && nowMin <= maxMin && (
                  <div className="ec-now" style={{ top: (nowMin - minMin) * pxPerMin }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const dayHeader = (d: Date) => (
    <>
      <span>{fmtWeekday.format(d).replace('.', '')}</span>
      <strong>{d.getDate()}</strong>
    </>
  )

  // ---------- Visão mês ----------
  function renderMonth() {
    const first = new Date(date.getFullYear(), date.getMonth(), 1)
    const gridStart = startOfWeek(first, weekStartsOn)
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).filter((d) => !hiddenWeekdays.includes(d.getDay()))
    const perRow = 7 - hiddenWeekdays.length
    const MAX = 3

    return (
      <div className="ec-month">
        <div className="ec-month-head" style={{ gridTemplateColumns: `repeat(${perRow}, 1fr)` }}>
          {days.slice(0, perRow).map((d) => (
            <div key={d.getDay()}>{fmtWeekday.format(d).replace('.', '')}</div>
          ))}
        </div>
        <div className="ec-month-grid" style={{ gridTemplateColumns: `repeat(${perRow}, 1fr)` }}>
          {days.map((d) => {
            const dayEvents = events
              .map(effective)
              .filter((e) => overlaps(e.start, e.end, d, addDays(d, 1)))
              .sort((a, b) => a.start.getTime() - b.start.getTime())
            const outside = d.getMonth() !== date.getMonth()
            return (
              <div
                key={d.getTime()}
                className={`ec-cell ${outside ? 'is-outside' : ''} ${sameDay(d, now) ? 'is-today' : ''}`}
                data-ec-cell
                data-day={d.getTime()}
                onClick={(e) => {
                  if (wasDrag(e)) return
                  setDate(d)
                  setView('dia')
                }}
              >
                <span className="ec-cell-day">{d.getDate()}</span>
                {dayEvents.slice(0, MAX).map((ev) => (
                  <div
                    key={ev.id}
                    className={`ec-chip ${ev.className ?? ''} ${preview?.id === ev.id ? 'is-dragging' : ''}`}
                    style={{ borderLeftColor: ev.color }}
                    onPointerDown={(e) => beginDrag(e, ev, 'move')}
                    onDragStart={(e) => e.preventDefault()}
                    onClick={(e) => clickEvent(e, ev)}
                  >
                    <b>{fmtTime.format(ev.start)}</b> {ev.title}
                  </div>
                ))}
                {dayEvents.length > MAX && <span className="ec-more">+{dayEvents.length - MAX} mais</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- Visão lista ----------
  function renderList() {
    const days = Array.from({ length: LISTA_DIAS }, (_, i) => addDays(date, i))
    const groups = days
      .map((d) => ({
        day: d,
        items: events.filter((e) => overlaps(e.start, e.end, d, addDays(d, 1))).sort((a, b) => a.start.getTime() - b.start.getTime()),
      }))
      .filter((g) => g.items.length)

    if (!groups.length) return <div className="ec-empty">Nenhum evento neste período.</div>
    return (
      <div className="ec-scroll ec-list">
        {groups.map((g) => (
          <section key={g.day.getTime()}>
            <h3 className={sameDay(g.day, now) ? 'is-today' : ''}>{capitalize(fmtListDay.format(g.day))}</h3>
            {g.items.map((ev) => (
              <button key={ev.id} className={`ec-list-item ${ev.className ?? ''}`} onClick={() => onEventClick?.(ev)}>
                <span className="ec-list-time">
                  {fmtTime.format(ev.start)} – {fmtTime.format(ev.end)}
                </span>
                <i style={{ background: ev.color }} />
                <span className="ec-list-body">{render(ev, false)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    )
  }

  const content = (() => {
    switch (view) {
      case 'mes':
        return renderMonth()
      case 'lista':
        return renderList()
      case 'dia':
        return renderTimeGrid([{ key: 'dia', day: date, header: dayHeader(date) }])
      case 'recursos':
        return renderTimeGrid(
          resources.map((r) => ({
            key: r.id,
            day: date,
            resourceId: r.id,
            header: (
              <span className="ec-resource">
                <i style={{ background: r.color }} /> {r.title}
              </span>
            ),
          })),
        )
      default:
        return renderTimeGrid(weekDays.map((d) => ({ key: String(d.getTime()), day: d, header: dayHeader(d) })))
    }
  })()

  return (
    <div className="ec card" onPointerDownCapture={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}>
      <div className="ec-toolbar">
        <div className="toolbar-group">
          <button className="btn btn-ghost" onClick={() => setDate(startOfDay(new Date()))}>Hoje</button>
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Anterior"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Próximo"><ChevronRight size={18} /></button>
          <strong className="toolbar-title">{title}</strong>
        </div>
        <div className="toolbar-group">
          <div className="segmented">
            {views.map((v) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
            ))}
          </div>
          {toolbarExtra}
        </div>
      </div>
      {content}
    </div>
  )
}

/** Distribui eventos sobrepostos em colunas lado a lado. */
function layoutLanes<T>(evs: CalendarEvent<T>[]) {
  const sorted = [...evs].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
  const result = new Map<string, { lane: number; lanes: number }>()
  let cluster: string[] = []
  let clusterEnd = 0
  let laneEnds: number[] = []

  const flush = () => {
    cluster.forEach((id) => (result.get(id)!.lanes = laneEnds.length))
    cluster = []
    laneEnds = []
    clusterEnd = 0
  }

  for (const e of sorted) {
    const s = e.start.getTime()
    if (cluster.length && s >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(e.end.getTime())
    } else laneEnds[lane] = e.end.getTime()
    result.set(e.id, { lane, lanes: 1 })
    cluster.push(e.id)
    clusterEnd = Math.max(clusterEnd, e.end.getTime())
  }
  flush()
  return result
}
