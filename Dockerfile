FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/watchmen.db

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
