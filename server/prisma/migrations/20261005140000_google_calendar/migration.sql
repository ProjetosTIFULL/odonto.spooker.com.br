-- AlterTable: Profissional - conexao com a Google Agenda (opcional, por profissional)
ALTER TABLE "Profissional" ADD COLUMN "googleEmail" TEXT;
ALTER TABLE "Profissional" ADD COLUMN "googleRefreshTokenCriptografado" TEXT;
ALTER TABLE "Profissional" ADD COLUMN "googleConectadoEm" TIMESTAMP(3);

-- AlterTable: Consulta - id do evento criado na Google Agenda, pra atualizar/excluir depois
ALTER TABLE "Consulta" ADD COLUMN "googleEventId" TEXT;
