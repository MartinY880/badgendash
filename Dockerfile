# Stage 1 — Build frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — Production
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "server/index.js"]
