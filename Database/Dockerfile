FROM node:24-alpine AS build
WORKDIR /build
COPY Database/package*.json ./
RUN npm ci
COPY Database/tsconfig.json ./
COPY Database/src ./src
RUN npm run build

FROM mongo:8.0
COPY --from=build /build/dist/01-init.js /docker-entrypoint-initdb.d/01-init.js
COPY --from=build /build/dist/healthcheck.js /opt/fintech/healthcheck.js