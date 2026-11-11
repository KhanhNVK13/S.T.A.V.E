# Build context phải là gốc repo: docker build -f frontend/Dockerfile .
FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared-types/package.json shared-types/
RUN npm install --no-audit --no-fund --ignore-scripts --workspace=frontend --workspace=shared-types --include-workspace-root=false

COPY shared-types shared-types
COPY frontend frontend

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PAYMENT_PROVIDER
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PAYMENT_PROVIDER=$NEXT_PUBLIC_PAYMENT_PROVIDER
RUN npm run build --workspace=frontend && chown -R node:node /app/frontend/.next

ENV NODE_ENV=production
USER node
WORKDIR /app/frontend
EXPOSE 3000
CMD ["npm", "run", "start"]
