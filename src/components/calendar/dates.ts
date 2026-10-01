// Helpers de data no fuso local do navegador (a clínica opera no horário de Brasília).

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())

export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const startOfWeek = (d: Date, weekStartsOn: 0 | 1) => {
  const s = startOfDay(d)
  return addDays(s, -((s.getDay() - weekStartsOn + 7) % 7))
}

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

export const atMinutes = (day: Date, minutes: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && aEnd > bStart

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', opts)
export const fmtTime = fmt({ hour: '2-digit', minute: '2-digit' })
export const fmtWeekday = fmt({ weekday: 'short' })
export const fmtDayMonth = fmt({ day: '2-digit', month: 'short' })
export const fmtMonthYear = fmt({ month: 'long', year: 'numeric' })
export const fmtFullDay = fmt({ weekday: 'long', day: '2-digit', month: 'long' })
export const fmtListDay = fmt({ weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

export const minutesLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
