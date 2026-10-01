-- Liga a Clinica ao agente de WhatsApp/IA dela no Orquestrador (spooker-platform).
-- Null = clinica ainda nao tem agente de IA conectado.
-- AlterTable
ALTER TABLE "Clinica" ADD COLUMN "agentId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Clinica_agentId_key" ON "Clinica"("agentId");
