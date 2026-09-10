FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
ARG VITE_API_ORIGIN
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN test -n "$VITE_API_ORIGIN" && npm run build -w @webapp/web
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker-compose/app/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
