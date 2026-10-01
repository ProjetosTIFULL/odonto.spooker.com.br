-- Nota pós-consulta (1 a 5). CHECK garante a faixa também fora da API.
-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Avaliacao_consultaId_key" ON "Avaliacao"("consultaId");

-- CreateIndex
CREATE INDEX "Avaliacao_clinicaId_criadoEm_idx" ON "Avaliacao"("clinicaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "Clinica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_nota_check" CHECK ("nota" BETWEEN 1 AND 5);
