# Admin SPA (Vite) → nginx static host with SPA fallback.
# VITE_API_BASE is baked in at build time (Railway service variable or ARG default).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
ARG VITE_API_BASE=https://api-production-0818.up.railway.app
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:1.27-alpine
# Only substitute PORT so nginx $uri stays intact.
ENV NGINX_ENVSUBST_FILTER=^PORT$
ENV PORT=8080
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
