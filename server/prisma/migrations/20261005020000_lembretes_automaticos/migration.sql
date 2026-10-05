-- AlterTable: Clinica - cada lembrete com liga/desliga e mensagem propria,
-- todos desligados por padrao (so o ADMIN da clinica ativa de proposito).
ALTER TABLE "Clinica" ADD COLUMN "lembreteConfirmacao24hAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinica" ADD COLUMN "lembreteConfirmacao24hMensagem" TEXT NOT NULL DEFAULT 'Olá {nome}! Lembrando da sua consulta amanhã às {hora}. Pode confirmar? Responda por aqui.';

ALTER TABLE "Clinica" ADD COLUMN "lembreteDiaConsultaAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinica" ADD COLUMN "lembreteDiaConsultaMensagem" TEXT NOT NULL DEFAULT 'Olá {nome}! Sua consulta é hoje às {hora}. Te esperamos!';

ALTER TABLE "Clinica" ADD COLUMN "lembreteAniversarioAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinica" ADD COLUMN "lembreteAniversarioMensagem" TEXT NOT NULL DEFAULT 'Parabéns, {nome}! 🎉 A equipe deseja a você um dia maravilhoso e um ano repleto de saúde e sorrisos!';

ALTER TABLE "Clinica" ADD COLUMN "lembreteRetornoAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinica" ADD COLUMN "lembreteRetornoMensagem" TEXT NOT NULL DEFAULT 'Olá {nome}! Faz um tempo que você não vem aqui. Que tal agendar uma consulta de retorno?';
ALTER TABLE "Clinica" ADD COLUMN "lembreteRetornoMesesLimite" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "Clinica" ADD COLUMN "lembretePesquisaSatisfacaoAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinica" ADD COLUMN "lembretePesquisaSatisfacaoMensagem" TEXT NOT NULL DEFAULT 'Olá {nome}! Como foi sua consulta de hoje? Adoraríamos saber sua opinião, de 1 a 5. 😊';

-- AlterTable: Paciente - dedupe de lembretes nao ligados a uma consulta
ALTER TABLE "Paciente" ADD COLUMN "ultimoParabensEm" TIMESTAMP(3);
ALTER TABLE "Paciente" ADD COLUMN "ultimaCampanhaRetornoEm" TIMESTAMP(3);

-- AlterTable: Consulta - dedupe de lembretes ligados a consulta especifica
ALTER TABLE "Consulta" ADD COLUMN "confirmacaoEnviada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consulta" ADD COLUMN "lembreteDiaEnviado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consulta" ADD COLUMN "pesquisaSatisfacaoEnviada" BOOLEAN NOT NULL DEFAULT false;
