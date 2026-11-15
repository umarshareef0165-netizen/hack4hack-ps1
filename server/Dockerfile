FROM node:22-alpine
WORKDIR /app
# No per-workspace lockfile (npm workspaces hoist it to the repo root),
# so install from package.json. Pinned versions in package.json keep the
# build reproducible; the root package-lock.json is the source of truth.
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
