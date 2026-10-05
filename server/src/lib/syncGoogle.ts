// Mantém o evento na Google Agenda do profissional em dia com a Consulta
// no Portal - best-effort (nunca lança erro pro chamador: se o Google
// estiver fora do ar, ou o token tiver expirado, a consulta continua
// salva normal no Portal, só não reflete lá fora dessa vez).
import { prisma } from '../db.ts'
import { atualizarEventoGoogle, criarEventoGoogle, excluirEventoGoogle } from './googleCalendar.ts'

/** Status em que a consulta deve aparecer na agenda (mesma lista usada pra checar conflito de horário). */
const OCUPAM = new Set(['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO', 'CONCLUIDA'])

export async function sincronizarConsultaComGoogle(consultaId: string): Promise<void> {
  try {
    const consulta = await prisma.consulta.findUnique({
      where: { id: consultaId },
      include: {
        paciente: { select: { nome: true, telefone: true } },
        profissional: { select: { googleRefreshTokenCriptografado: true } },
        procedimento: { select: { nome: true } },
      },
    })
    if (!consulta) return
    const refreshToken = consulta.profissional.googleRefreshTokenCriptografado
    if (!refreshToken) return // dentista não conectou a Google Agenda - nada a fazer

    const deveriaExistir = OCUPAM.has(consulta.status)
    const evento = {
      inicio: consulta.inicio,
      fim: consulta.fim,
      tituloPaciente: `${consulta.procedimento?.nome ?? 'Consulta'} - ${consulta.paciente.nome}`,
      descricao: `Paciente: ${consulta.paciente.nome}\nTelefone: ${consulta.paciente.telefone}${consulta.observacoes ? `\n\n${consulta.observacoes}` : ''}`,
    }

    if (deveriaExistir && !consulta.googleEventId) {
      const eventId = await criarEventoGoogle(refreshToken, evento)
      await prisma.consulta.update({ where: { id: consultaId }, data: { googleEventId: eventId } })
    } else if (deveriaExistir && consulta.googleEventId) {
      await atualizarEventoGoogle(refreshToken, consulta.googleEventId, evento)
    } else if (!deveriaExistir && consulta.googleEventId) {
      await excluirEventoGoogle(refreshToken, consulta.googleEventId)
      await prisma.consulta.update({ where: { id: consultaId }, data: { googleEventId: null } })
    }
  } catch (e) {
    console.error(`[google-calendar] Não foi possível sincronizar a consulta ${consultaId}:`, e)
  }
}

/** Mesma ideia, pra quando a consulta é excluída de verdade do Portal (não só cancelada) - chamar ANTES do delete, com os dados que ainda dá tempo de ler. */
export async function removerEventoGoogleAoExcluir(consultaId: string): Promise<void> {
  try {
    const consulta = await prisma.consulta.findUnique({
      where: { id: consultaId },
      select: { googleEventId: true, profissional: { select: { googleRefreshTokenCriptografado: true } } },
    })
    const refreshToken = consulta?.profissional.googleRefreshTokenCriptografado
    if (refreshToken && consulta?.googleEventId) await excluirEventoGoogle(refreshToken, consulta.googleEventId)
  } catch (e) {
    console.error(`[google-calendar] Não foi possível remover o evento da consulta ${consultaId}:`, e)
  }
}
