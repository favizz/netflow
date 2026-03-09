# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm build

# Stage 2: Serve
FROM nginx:alpine
# Copy built static files to Nginx default html directory
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
