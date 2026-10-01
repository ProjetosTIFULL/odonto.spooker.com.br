import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Sem env('DATABASE_URL') de propósito: ele falha já no `npm install` (postinstall: prisma generate),
    // que não precisa de banco. Comandos que conectam (migrate, seed, studio) acusam a URL vazia na hora.
    url: process.env.DATABASE_URL ?? '',
  },
})
