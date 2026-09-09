FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 fontconfig \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install tsx typescript
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY assets ./assets
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
