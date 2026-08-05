# Multi-stage build producing a thin Next.js "standalone" runtime image.

# 1. Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Build. REST calls use the relative /api/v1 path, proxied server-side via
#    next.config.ts rewrites. Next bakes rewrites during build, so compose must
#    pass the container-reachable API URL here.
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
ARG INTERNAL_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    INTERNAL_API_URL=$INTERNAL_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Runtime — copy only the standalone server + static assets
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
