import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default('http://localhost:5180'),
  MCP_PORT: z.coerce.number().default(3334),
  /** api-gateway do Orquestrador (spooker-platform) - rede interna, sem autenticação (mesmo padrão dos outros serviços internos dele). */
  GATEWAY_URL: z.string().default('http://api-gateway:8200'),
  /** Pasta onde os arquivos de mídia do Chat (fotos/vídeos enviados e recebidos) ficam salvos. */
  UPLOADS_DIR: z.string().default('./uploads'),
  /** Chave pra criptografar segredos de terceiros guardados no banco (hoje: refresh_token da Google Agenda). Gerar com "openssl rand -hex 32". */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY precisa ter pelo menos 32 caracteres').default('troque-por-uma-chave-aleatoria-de-32-chars'),
  /** Credenciais OAuth do projeto no Google Cloud (Google Calendar API) - vazio = integração desligada, sem travar o resto do Portal. */
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
})

export const env = schema.parse(process.env)
