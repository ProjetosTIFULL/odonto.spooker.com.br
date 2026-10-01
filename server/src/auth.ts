import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Papel } from './generated/prisma/client.ts'
import { prisma } from './db.ts'
import { HttpError } from './lib/http.ts'

export type UsuarioToken = { sub: string; clinicaId: string; papel: Papel }

/** O que fica em req.user depois de autenticar: dados do token + o colaborador vinculado (lido do banco). */
export type UsuarioLogado = UsuarioToken & { profissionalId: string | null }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UsuarioToken
    user: UsuarioLogado
  }
}

export async function autenticar(req: FastifyRequest) {
  try {
    await req.jwtVerify()
  } catch {
    throw new HttpError(401, 'Não autenticado')
  }
  // Perfil e status vêm do banco, não do token: mudança de perfil ou desativação vale na hora
  const u = await prisma.usuario.findUnique({
    where: { id: req.user.sub },
    select: { papel: true, ativo: true, clinicaId: true, profissional: { select: { id: true } } },
  })
  if (!u?.ativo) throw new HttpError(401, 'Usuário inativo ou removido')
  req.user = { sub: req.user.sub, clinicaId: u.clinicaId, papel: u.papel, profissionalId: u.profissional?.id ?? null }
}

/**
 * Dentista só enxerga e mexe na própria agenda: devolve o id do dentista vinculado ao login,
 * ou null para quem vê a clínica toda (ADMIN, OPERADOR).
 */
export function agendaRestrita(req: FastifyRequest): string | null {
  if (req.user.papel !== 'DENTISTA') return null
  if (!req.user.profissionalId) {
    throw new HttpError(403, 'Seu login não está vinculado a um dentista. Peça ao administrador para vincular em Configurações > Usuários.')
  }
  return req.user.profissionalId
}

/**
 * Matriz de acesso:
 * - ADMIN: tudo
 * - OPERADOR (secretário/operador): tudo menos Configurações (clínica, horários, colaboradores, procedimentos, usuários)
 * - DENTISTA (dentista/médico): só a Agenda (consultas + leituras de apoio: pacientes, profissionais, procedimentos, horários)
 */
export const EQUIPE_ATENDIMENTO: Papel[] = ['ADMIN', 'OPERADOR']

/** preHandler que restringe a rota a determinados papéis. */
export const exigirPapel =
  (...papeis: Papel[]) =>
  async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!papeis.includes(req.user.papel)) throw new HttpError(403, 'Sem permissão para esta ação')
  }
