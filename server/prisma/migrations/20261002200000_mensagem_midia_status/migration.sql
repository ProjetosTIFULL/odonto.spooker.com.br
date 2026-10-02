-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- AlterTable: texto vira opcional (mensagem pode ser so midia),
-- novas colunas de midia, id da mensagem no WhatsApp (correlaciona
-- eventos de status) e status de entrega/leitura.
ALTER TABLE "Mensagem" ALTER COLUMN "texto" DROP NOT NULL;
ALTER TABLE "Mensagem" ADD COLUMN "midiaUrl" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "midiaTipo" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "whatsappId" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "status" "StatusMensagem" NOT NULL DEFAULT 'ENVIADA';

-- CreateIndex
CREATE INDEX "Mensagem_whatsappId_idx" ON "Mensagem"("whatsappId");
