import { z } from 'zod'

export class HttpError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export const naoEncontrado = (o = 'Registro') => new HttpError(404, `${o} não encontrado`)

export const idParams = z.object({ id: z.uuid() })

/** Mantém só dígitos e garante o DDI 55 para números brasileiros (10 ou 11 dígitos). */
export function normalizarTelefone(tel: string) {
  const d = tel.replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? `55${d}` : d
}
