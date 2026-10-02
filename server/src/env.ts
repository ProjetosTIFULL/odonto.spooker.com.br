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
  /** Endereço pelo qual OUTROS containers (Evolution API, via api-gateway) alcançam esta API na rede interna - usado pra montar a URL de mídia que o WhatsApp baixa. Nome do container fixo via COMPOSE_PROJECT_NAME=odonto-spooker. */
  INTERNAL_BASE_URL: z.string().default('http://odonto-spooker-api-1:3333'),
})

export const env = schema.parse(process.env)
