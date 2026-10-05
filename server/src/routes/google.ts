// Conexão da Google Agenda, por profissional (OAuth) - ver server/src/lib/
// googleCalendar.ts pra entender o fluxo completo. /callback é a única
// rota desse arquivo que NÃO exige login normal (o navegador chega aqui
// vindo direto do Google, sem conseguir mandar nosso header de
// autenticação) - a identidade de quem está conectando vem do "state"
// assinado, gerado em /conectar.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { autenticar } from '../auth.ts'
import { prisma } from '../db.ts'
import { criptografar } from '../lib/crypto.ts'
import { gerarState, verificarState } from '../lib/estadoGoogle.ts'
import { HttpError, naoEncontrado } from '../lib/http.ts'
import {
  buscarEmailDaConta, googleConfigurado, trocarCodigoPorTokens, urlDeAutorizacao,
} from '../lib/googleCalendar.ts'

export default async function googleRoutes(app: FastifyInstance) {
  /**
   * Devolve a URL de consentimento do Google (o front quem navega pra lá) -
   * exige estar logado, só ADMIN ou o próprio dentista conectando a própria
   * agenda. Não faz reply.redirect aqui: o front autentica por header
   * Authorization (token no localStorage), e um <a href> de navegação
   * direta do navegador não manda esse header - por isso essa rota é uma
   * chamada normal da API (GET com fetch) que devolve a URL em JSON, e o
   * front quem faz window.location = url.
   */
  app.get('/conectar/:profissionalId', { onRequest: autenticar }, async (req) => {
    if (!googleConfigurado()) throw new HttpError(503, 'Integração com a Google Agenda ainda não foi configurada pela equipe Spooker.')
    const { profissionalId } = z.object({ profissionalId: z.uuid() }).parse(req.params)
    const profissional = await prisma.profissional.findFirst({ where: { id: profissionalId, clinicaId: req.user.clinicaId } })
    if (!profissional) throw naoEncontrado('Profissional')
    const souEu = profissional.usuarioId === req.user.sub
    if (req.user.papel !== 'ADMIN' && !souEu) throw new HttpError(403, 'Só o próprio dentista ou um administrador pode conectar essa agenda.')

    const state = gerarState({ profissionalId, clinicaId: req.user.clinicaId })
    return { url: urlDeAutorizacao(state) }
  })

  /** O Google chama essa URL de volta depois que a pessoa autoriza (ou recusa). */
  app.get('/callback', async (req, reply) => {
    const { code, state, error } = z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() }).parse(req.query)
    let payload: { profissionalId: string; clinicaId: string }
    try {
      payload = verificarState(state)
    } catch {
      return reply.code(400).send('Link expirado ou inválido - volte ao Portal e tente conectar de novo.')
    }

    if (error || !code) {
      return reply.redirect(`https://odonto.spooker.com.br/configuracoes?google=recusado`)
    }

    try {
      const tokens = await trocarCodigoPorTokens(code)
      if (!tokens.refresh_token) {
        // Acontece se a pessoa ja tinha conectado antes e o Google decidiu nao mandar um refresh_token novo dessa vez - raro com prompt=consent, mas possivel.
        return reply.redirect(`https://odonto.spooker.com.br/configuracoes?google=repita`)
      }
      const email = await buscarEmailDaConta(tokens.access_token)
      await prisma.profissional.update({
        where: { id: payload.profissionalId },
        data: {
          googleRefreshTokenCriptografado: criptografar(tokens.refresh_token),
          googleEmail: email,
          googleConectadoEm: new Date(),
        },
      })
      return reply.redirect(`https://odonto.spooker.com.br/configuracoes?google=conectado`)
    } catch (e) {
      req.log.error(e)
      return reply.redirect(`https://odonto.spooker.com.br/configuracoes?google=erro`)
    }
  })

  app.post('/desconectar/:profissionalId', { onRequest: autenticar }, async (req) => {
    const { profissionalId } = z.object({ profissionalId: z.uuid() }).parse(req.params)
    const profissional = await prisma.profissional.findFirst({ where: { id: profissionalId, clinicaId: req.user.clinicaId } })
    if (!profissional) throw naoEncontrado('Profissional')
    const souEu = profissional.usuarioId === req.user.sub
    if (req.user.papel !== 'ADMIN' && !souEu) throw new HttpError(403, 'Só o próprio dentista ou um administrador pode desconectar essa agenda.')
    await prisma.profissional.update({
      where: { id: profissionalId },
      data: { googleRefreshTokenCriptografado: null, googleEmail: null, googleConectadoEm: null },
    })
    return { status: 'desconectado' }
  })
}
