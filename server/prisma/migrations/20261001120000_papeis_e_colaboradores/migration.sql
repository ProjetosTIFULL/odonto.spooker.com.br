-- Perfil "recepção" passa a se chamar "operador" (secretário/operador). RENAME preserva os usuários existentes.
ALTER TYPE "Papel" RENAME VALUE 'RECEPCAO' TO 'OPERADOR';
ALTER TABLE "Usuario" ALTER COLUMN "papel" SET DEFAULT 'OPERADOR';

-- Profissional passa a representar todos os colaboradores da clínica
CREATE TYPE "FuncaoColaborador" AS ENUM ('DENTISTA', 'SECRETARIO');

ALTER TABLE "Profissional"
  ADD COLUMN "funcao" "FuncaoColaborador" NOT NULL DEFAULT 'DENTISTA',
  ADD COLUMN "telefone" TEXT,
  ADD COLUMN "email" TEXT;
