import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    host: '0.0.0.0',
    // Local (fora do Docker): aponta pro backend em localhost. Dentro do
    // docker-compose, o front fala com o container "api" pelo nome.
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:3333' },
    // Sem isso o Vite recusa requisicoes que chegam com um Host diferente
    // de localhost (protecao padrao contra DNS rebinding) - aqui chega
    // sempre atras do nosso proprio Nginx, entao e seguro liberar geral.
    allowedHosts: true,
  },
  preview: { port: 5180, strictPort: true },
})
