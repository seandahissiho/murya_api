FROM node:20-bookworm AS build
WORKDIR /app

# Installe dépendances
COPY package*.json ./
RUN npm ci

# Copie le code et build
COPY . .
RUN npm run build

FROM node:20-bookworm
WORKDIR /app
ENV NODE_ENV=production

# Copie runtime (prod)
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Cloud Run écoute PORT (souvent 8080)
EXPOSE 8080

CMD ["node", "dist/src/index.js"]
