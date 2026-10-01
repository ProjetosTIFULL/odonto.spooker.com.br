import { buildApp } from './app.ts'
import { prisma } from './db.ts'
import { env } from './env.ts'

const app = await buildApp()

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

await app.listen({ port: env.PORT, host: '0.0.0.0' })
