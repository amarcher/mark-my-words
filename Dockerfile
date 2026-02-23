# --- Build stage ---
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# Build shared (--composite false avoids incremental emit issues in Docker)
RUN cd shared && npx tsc --composite false

# Build server
RUN cd server && npx tsc

# Build client (skip type-check in Docker, just bundle with Vite)
RUN cd client && npx vite build

# --- Runtime stage ---
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

# Copy server data (word rankings)
COPY server/data server/data

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server/dist/index.js"]
