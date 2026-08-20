# syntax=docker/dockerfile:1
# Build context — корень репозитория: docker build -t bookingapi .

# --- Фронтенд: сборка Vite в dist ---
FROM node:22-alpine AS frontend

WORKDIR /fe

# Сначала зависимости — для кэширования слоя
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Бэкенд: сборка статического бинарника ---
FROM golang:1.26-alpine AS backend

RUN apk add --no-cache ca-certificates

WORKDIR /src

# Сначала зависимости — для кэширования слоя
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server .

# --- Финальный образ: только бинарник и статика ---
FROM scratch

COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=backend /out/server /server
# Статика фронтенда — в ./build рядом с бинарником
COPY --from=frontend /fe/dist /build

USER 65534

EXPOSE 8080

ENTRYPOINT ["/server"]
