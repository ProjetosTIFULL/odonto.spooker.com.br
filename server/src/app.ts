import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { z, ZodError } from 'zod'
import { env } from './env.ts'
import { Prisma } from './generated/prisma/client.ts'
import { HttpError } from './lib/http.ts'
import authRoutes from './routes/auth.ts'
import clinicaRoutes from './routes/clinica.ts'
import consultasRoutes from './routes/consultas.ts'
import conversasRoutes from './routes/conversas.ts'
import dashboardRoutes from './routes/dashboard.ts'
import pacientesRoutes from './routes/pacientes.ts'
import procedimentosRoutes from './routes/procedimentos.ts'
import profissionaisRoutes from './routes/profissionais.ts'
import usuariosRoutes from './routes/usuarios.ts'

z.config(z.locales.pt())

/** Decimal do Prisma (valores em R$) vira number no JSON, em vez de string. */
function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key]
  return Prisma.Decimal.isDecimal(raw) ? Number(raw) : value
}

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })

  app.setReplySerializer((payload) => JSON.stringify(payload, replacer))

  // Aceita corpo vazio com content-type JSON (comum em DELETE vindo do front)
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, body ? JSON.parse(body as string) : undefined)
    } catch {
      done(new HttpError(400, 'JSON inválido'), undefined)
    }
  })

  await app.register(cors, { origin: env.CORS_ORIGIN.split(','), credentials: true })
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '12h' } })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        erro: 'Dados inválidos',
        detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      })
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ erro: err.message })
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return reply.code(404).send({ erro: 'Registro não encontrado' })
      if (err.code === 'P2002') return reply.code(409).send({ erro: 'Registro duplicado' })
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ erro: (err as Error).message })

    req.log.error(err)
    return reply.code(500).send({ erro: 'Erro interno' })
  })

  app.get('/api/health', async () => ({ ok: true }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(clinicaRoutes, { prefix: '/api/clinica' })
  await app.register(usuariosRoutes, { prefix: '/api/usuarios' })
  await app.register(profissionaisRoutes, { prefix: '/api/profissionais' })
  await app.register(procedimentosRoutes, { prefix: '/api/procedimentos' })
  await app.register(pacientesRoutes, { prefix: '/api/pacientes' })
  await app.register(consultasRoutes, { prefix: '/api/consultas' })
  await app.register(conversasRoutes, { prefix: '/api/conversas' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })

  return app
}
