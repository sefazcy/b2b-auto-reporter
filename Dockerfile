FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Alert state lives in /app/data (mount a volume to keep it across rebuilds)
RUN mkdir -p data && chown -R node:node data
USER node

CMD ["node", "src/index.js"]
