# Build context phải là gốc repo: docker build -f backend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared-types/package.json shared-types/
RUN npm ci --ignore-scripts --workspace=backend --workspace=shared-types --include-workspace-root=false
COPY shared-types shared-types
COPY backend backend
RUN npm run build --workspace=backend \
 && npm exec --workspace=backend -- tsc -p ../shared-types --outDir ../shared-types/dist

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared-types/package.json shared-types/
RUN npm ci --omit=dev --ignore-scripts --workspace=backend --workspace=shared-types --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /app/shared-types/dist shared-types/dist
RUN cd shared-types && npm pkg set main=dist/index.js types=dist/index.d.ts
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 3001
CMD ["node", "dist/main"]
