import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Papel } from './generated/prisma/client.ts'
import { HttpError } from './lib/http.ts'

export type UsuarioToken = { sub: string; clinicaId: string; papel: Papel }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UsuarioToken
    user: UsuarioToken
  }
}

export async function autenticar(req: FastifyRequest) {
  try {
    await req.jwtVerify()
  } catch {
    throw new HttpError(401, 'Não autenticado')
  }
}

/** preHandler que restringe a rota a determinados papéis. */
export const exigirPapel =
  (...papeis: Papel[]) =>
  async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!papeis.includes(req.user.papel)) throw new HttpError(403, 'Sem permissão para esta ação')
  }
