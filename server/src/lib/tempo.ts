// O Brasil (horário de Brasília) não tem horário de verão desde 2019, então o offset é fixo.
// Quando houver clínicas em outros fusos, mover isso para um campo em Clinica.
export const OFFSET = '-03:00'

/** Início do dia (00:00 no horário de Brasília) de uma data YYYY-MM-DD. */
export const inicioDoDia = (data: string) => new Date(`${data}T00:00:00${OFFSET}`)

export const addDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

/** Data de hoje (YYYY-MM-DD) no horário de Brasília. */
export function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** Converte "HH:mm" de um dia YYYY-MM-DD em Date. */
export const emHorario = (data: string, hhmm: string) => new Date(`${data}T${hhmm}:00${OFFSET}`)

export const horaValida = /^([01]\d|2[0-3]):[0-5]\d$/
