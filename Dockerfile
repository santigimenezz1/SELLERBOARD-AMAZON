# Imagen para Railway. Next.js en modo "standalone": un servidor Node autónomo.
FROM node:24-slim AS base
WORKDIR /app

# ---- dependencias
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build
FROM base AS build
# Next.js incrusta las variables NEXT_PUBLIC_* en el build: Railway las pasa como build args.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Usuario sin privilegios que ya trae la imagen oficial de Node.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
