FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate
