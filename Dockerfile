# Install all dependencies and build
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev


# Runtime: without dev dependencies and source files
FROM node:22-alpine AS runtime

# git and ripgrep are used by the review tools (checkouts and search_code)
RUN apk add --no-cache git ripgrep ca-certificates

WORKDIR /app

COPY package.json package-lock.json .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY database.json .
COPY migrations ./migrations

USER node
CMD ["node", "build/src/server.js"]
