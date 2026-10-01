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

Logins de demonstração (senha `demo1234`):

| E-mail | Perfil | Acessa |
|---|---|---|
| `admin@demo.com` | Administrador | Tudo, inclusive Configurações |
| `recepcao@demo.com` | Secretário(a) / Operador | Dashboard, Agenda, Chat e Clientes |
| `ana@demo.com` | Dentista / Médico | Somente a Agenda |

## Perfis e colaboradores

- **Profissionais e colaboradores** (Configurações): todas as pessoas da clínica, com função
  *Dentista / Médico* (aparece como coluna na agenda e recebe consultas) ou *Secretário(a) / Operador*.
- **Usuários e permissões** (Configurações): login (e-mail + senha), perfil de acesso e vínculo com o colaborador.
- A API aplica a mesma matriz (`server/src/auth.ts`) e lê o perfil do banco a cada requisição:
  mudar o perfil ou desativar um usuário vale na hora, mesmo com sessão aberta.

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
| GET/POST/PUT | `/api/usuarios` | Logins da clínica, perfil e vínculo com colaborador (somente ADMIN) |
| GET/POST/PUT/DELETE | `/api/profissionais?funcao=DENTISTA` | Colaboradores (dentistas e secretários). DELETE apenas desativa |
| GET/POST/PUT/DELETE | `/api/procedimentos` | Nome, TUSS, duração, valor. DELETE apenas desativa |
| GET | `/api/pacientes?busca=&status=&pagina=&porPagina=` | Lista com última visita e próxima consulta |
| GET/POST/PUT/DELETE | `/api/pacientes/:id` | GET traz o histórico de consultas |
| GET | `/api/consultas?de=&ate=&profissionalId=&pacienteId=&status=` | Agenda do período |
| GET | `/api/consultas/horarios-livres?data=&profissionalId=&duracaoMin=` | Horários disponíveis |
| POST/PUT/DELETE | `/api/consultas/:id` | Valida conflito de horário do profissional e bloqueia horário passado |
| PATCH | `/api/consultas/:id/status` | Agendada, confirmada, em atendimento, concluída, faltou, cancelada |
| POST | `/api/consultas/:id/remarcar` | Cria a nova consulta e marca a original como `REMARCADA` (transação) |
| PUT | `/api/consultas/:id/avaliacao` | Nota pós-consulta 1–5 + comentário (só consulta concluída; ADMIN/OPERADOR) |
| GET/POST | `/api/conversas` | Lista / abre conversa por telefone |
| GET | `/api/conversas/:id` | Mensagens (zera não lidas) |
| POST | `/api/conversas/:id/mensagens` | Registra mensagem (envio real pelo WhatsApp: pendente) |
| PUT | `/api/conversas/:id/paciente` | Vincula conversa a um paciente |
| GET | `/api/dashboard/rotina` | Dia a dia: agenda de hoje, pendências de baixa, confirmações de amanhã (ADMIN/OPERADOR, sem valores em R$) |
| GET | `/api/dashboard/financeiro?data=` | Realizado, previsto, ticket, faltas, 6 meses, por dentista/procedimento (ADMIN) |
| GET | `/api/dashboard/desempenho?dias=30\|90\|180` | Atendimentos, comparecimento e notas por dentista (ADMIN) |

Erros seguem o formato `{ "erro": "...", "detalhes"?: [{ "campo", "mensagem" }] }`.

### Regras de acesso na API

| Recurso | Admin | Operador | Dentista |
|---|---|---|---|
| Consultas (agenda) | clínica toda | clínica toda | **só as próprias** (outras respondem 404) |
| Pacientes | tudo | ler, criar, editar | só leitura |
| Conversas | sim | sim | não |
| Dashboard rotina | sim | sim | não |
| Dashboard financeiro e desempenho | sim | não | não |
| Configurações (clínica, horários, colaboradores, procedimentos, usuários) | sim | não | não |

O dentista é identificado pelo colaborador vinculado ao login (`agendaRestrita()` em `server/src/auth.ts`).
Login de dentista sem vínculo recebe 403 nas rotas de agenda.

## Scripts do servidor

| Script | O que faz |
|---|---|
| `npm run dev` | API com reload automático |
| `npm run typecheck` | Checagem de tipos |
| `npm run db:migrate` | Cria nova migration após alterar `prisma/schema.prisma` |
| `npm run db:deploy` | Aplica migrations (produção) |
| `npm run db:seed` | Recria os dados de demonstração |
| `npm run db:studio` | Interface visual do banco |

> `db:migrate` (`prisma migrate dev`) é interativo e não roda em terminal não interativo (CI, alguns
> editores). Nesse caso, gere o SQL com
> `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
> salve em `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` e aplique com `npm run db:deploy`.
> Renomear valor de enum: escreva o `ALTER TYPE ... RENAME VALUE` à mão (o diff gera drop/create e perde dados).

> ⚠️ `npm run db:seed` **apaga e recria** a clínica de demonstração (`admin@demo.com`). Nunca rode em produção.

## Estrutura do código

```
server/
├─ prisma/schema.prisma        modelos (multi-clínica: tudo tem clinicaId)
├─ prisma/migrations/          SQL versionado
├─ prisma/seed.ts              dados de demonstração (~6 meses de histórico + avaliações)
└─ src/
   ├─ app.ts                   Fastify, CORS, JWT, tratamento de erros, registro das rotas
   ├─ auth.ts                  autenticar(), exigirPapel(), agendaRestrita() e a matriz de acesso
   ├─ lib/http.ts              HttpError, normalizarTelefone()
   ├─ lib/tempo.ts             datas no horário de Brasília
   └─ routes/*.ts              uma rota por recurso

src/                           front-end
├─ lib/api.ts                  fetch com token; 401 encerra a sessão
├─ auth/                       AuthContext (login/sessão) e permissoes.ts (mesma matriz da API)
├─ components/calendar/        calendário da agenda (React puro, sem biblioteca)
├─ components/charts.tsx       gráficos simples em HTML/CSS (colunas, barras, stat tile)
├─ pages/                      uma página por item do menu
│  ├─ dashboard/               Financeiro, Rotina, Desempenho
│  └─ config/                  seções de Configurações ligadas à API
├─ data/mock.ts                dados de exemplo das telas ainda não ligadas à API
└─ styles/global.css           todo o CSS (sem framework; variáveis em :root)
```

### Convenções

- **Código e textos em português** (nomes de variáveis, rotas, mensagens de erro).
- **Validação com zod** em toda entrada; o erro sai no formato padrão automaticamente.
- **Todo acesso a dado filtra por `clinicaId`** do usuário logado. Em rotas de consulta, use `escopo(req)`
  (já inclui a restrição do dentista).
- **Valores em R$** são `Decimal` no banco e saem como `number` no JSON (serializer em `app.ts`).
- **Front sem framework de CSS**: estilos em `global.css`, reaproveitando as classes existentes
  (`card`, `btn`, `input`, `badge`, `segmented`, `table`...).

## Situação do projeto

**Ligado à API (funcionando de ponta a ponta):** login e perfis, Agenda, Dashboard
(Financeiro, Rotina com "dar baixa", Desempenho), Configurações › Profissionais e colaboradores
e Usuários e permissões.

**Só tela (dados de `src/data/mock.ts`), API já existe:**
- Chat (`/api/conversas`)
- Clientes (`/api/pacientes`)
- Configurações › Dados da clínica (`/api/clinica`), Horários (`/api/clinica/horarios`),
  Procedimentos e preços (`/api/procedimentos`)

**Só tela, sem API:** busca do topo, Configurações › WhatsApp, MCP / Agente IA, Lembretes automáticos,
Plano e assinatura, botões "Enviar parabéns" e "Sincronizar com MCP", contador "4" do Chat no menu (fixo).

**Não iniciado:**
- Integração real com WhatsApp (hoje as mensagens só são gravadas no banco)
- Tela para registrar a nota pós-consulta (só existe a rota `PUT /api/consultas/:id/avaliacao`)
- Testes automatizados

## Antes de produção

- **Token de login** fica no `localStorage`; avaliar cookie `httpOnly` + proteção CSRF.
- **Sem limite de tentativas** no `/api/auth/login` (adicionar rate limit).
- **Fuso fixo** em horário de Brasília (`server/src/lib/tempo.ts`); virar campo da clínica se houver outros fusos.
- **Deploy não configurado**: falta Dockerfile da API, variáveis de ambiente de produção e `CORS_ORIGIN` real.
- **`npm audit`** aponta 4 alertas no CLI do Prisma (`mysql2`, `deepmerge-ts`): ferramenta de desenvolvimento,
  não roda dentro da API.
- **Seed** não pode rodar em produção (apaga a clínica demo).
