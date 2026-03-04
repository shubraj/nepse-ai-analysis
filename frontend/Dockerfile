# Frontend: build then serve with nginx
# Stage 1: build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* .yarnrc.yml* ./
RUN corepack enable yarn && (yarn install --frozen-lockfile 2>/dev/null || npm ci 2>/dev/null || npm install)

COPY . .

# API base URL at build time (use /api when served behind same host with proxy)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN yarn build 2>/dev/null || npm run build

# Stage 2: serve
FROM nginx:alpine

# Serve SPA and proxy /api to backend
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
    location /api { proxy_pass http://backend:8000; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; } \
  }' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
