# Odonto Portal (Spooker)

Portal para clínicas odontológicas e dentistas autônomos.

- `/` — front-end (React + Vite + TypeScript), porta **5180**
- `/server` — API (Node + Fastify + Prisma + PostgreSQL), porta **3333**

## Rodando localmente

```bash
# 1. Banco (PostgreSQL na porta 5433)
docker compose -p odonto-spooker up -d

# 2. API
cd server
cp .env.example .env        # ajuste o JWT_SECRET
npm install                 # também gera o Prisma Client
npm run db:deploy           # aplica as migrations
npm run db:seed             # dados de demonstração
npm run dev                 # http://localhost:3333

# 3. Front (outro terminal, na raiz)
npm install
npm run dev                 # http://localhost:5180 (proxy /api -> 3333)
```

Login de demonstração: `admin@demo.com` / `demo1234`
(também `ana@demo.com` — dentista — e `recepcao@demo.com` — recepção, mesma senha).

## API

Todas as rotas (exceto `/api/auth/*` e `/api/health`) exigem `Authorization: Bearer <token>`.
Os dados são sempre filtrados pela clínica do usuário logado.
Datas trafegam em ISO 8601 (UTC); filtros por dia usam `YYYY-MM-DD` no horário de Brasília.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/registrar` | Cria clínica/autônomo + usuário ADMIN |
| POST | `/api/auth/login` | Retorna `{ token, usuario }` |
| GET | `/api/auth/me` | Usuário logado + clínica |
| GET/PUT | `/api/clinica` | Dados da clínica (PUT: ADMIN) |
| GET/PUT | `/api/clinica/horarios` | Horário de atendimento por dia da semana (PUT: ADMIN) |
| GET/POST/PUT | `/api/usuarios` | Usuários da clínica (somente ADMIN) |
| GET/POST/PUT/DELETE | `/api/profissionais` | DELETE apenas desativa |
| GET/POST/PUT/DELETE | `/api/procedimentos` | Nome, TUSS, duração, valor. DELETE apenas desativa |
| GET | `/api/pacientes?busca=&status=&pagina=&porPagina=` | Lista com última visita e próxima consulta |
| GET/POST/PUT/DELETE | `/api/pacientes/:id` | GET traz o histórico de consultas |
| GET | `/api/consultas?de=&ate=&profissionalId=&pacienteId=&status=` | Agenda do período |
| GET | `/api/consultas/horarios-livres?data=&profissionalId=&duracaoMin=` | Horários disponíveis |
| POST/PUT/DELETE | `/api/consultas/:id` | Valida conflito de horário do profissional |
| PATCH | `/api/consultas/:id/status` | Agendada, confirmada, em atendimento, concluída, faltou, cancelada |
| GET/POST | `/api/conversas` | Lista / abre conversa por telefone |
| GET | `/api/conversas/:id` | Mensagens (zera não lidas) |
| POST | `/api/conversas/:id/mensagens` | Registra mensagem (envio real pelo WhatsApp: pendente) |
| PUT | `/api/conversas/:id/paciente` | Vincula conversa a um paciente |
| GET | `/api/dashboard?data=` | Indicadores do dia/mês, agenda de hoje, aniversariantes |

Erros seguem o formato `{ "erro": "...", "detalhes"?: [{ "campo", "mensagem" }] }`.

## Scripts do servidor

| Script | O que faz |
|---|---|
| `npm run dev` | API com reload automático |
| `npm run typecheck` | Checagem de tipos |
| `npm run db:migrate` | Cria nova migration após alterar `prisma/schema.prisma` |
| `npm run db:deploy` | Aplica migrations (produção) |
| `npm run db:seed` | Recria os dados de demonstração |
| `npm run db:studio` | Interface visual do banco |
