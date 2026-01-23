# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
