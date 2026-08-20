## Context

Репозиторий уже содержит TypeSpec-описание сервиса и сгенерированную из него OpenAPI 3.0 спецификацию `spec/tsp-output/@typespec/openapi3/openapi.yaml` (см. proposal.md — Why). Директории `backend/` пока нет. Нужно построить Go-сервер, точно реализующий контракт спецификации, с хранением в памяти.

Ограничения (заданы пользователем):
- Язык — Go; HTTP-роутер — `go-chi/chi/v5`.
- Генерация серверного кода — `oapi-codegen` (strict server) из `openapi.yaml`.
- Хранилище — только in-memory, без БД.
- Конфигурация окружения — `kelseyhightower/envconfig`.
- Логирование — `log/slog`.

## Goals / Non-Goals

**Goals:**
- Полное покрытие эндпоинтов спецификации с корректными кодами ошибок и схемами `code`.
- Воспроизводимая генерация кода из `openapi.yaml` через Makefile.
- Чистое разделение: сгенерированный код не правится вручную; вся логика — в хендлерах и доменном слое.
- Потокобезопасное in-memory хранилище (mutex) под предполагаемую однопроцессную модель.

**Non-Goals:**
- Персистентность (БД, файлы) — данные живут только в памяти процесса.
- Реальная авторизация/OAuth — MVP с httpOnly cookie и статическими учётными данными владельца.
- Генерация документации/UI, gRPC, многопроцессность/кластеризация.

## Decisions

### 1. Генерация через oapi-codegen с конфигом
Используем `github.com/oapi-codegen/oapi-codegen/v2` с файлом `backend/api/oapi-codegen.yaml`, опциями:
- `generate: chi-server, types, strict-server, embedded-spec`
- `package: api`
- `output: backend/api/gen.go`

Генерируются: типы Go из схем, интерфейс `StrictServerInterface`, chi-роутер (`HandlerFromMux`) и встроенная спецификация. Ручные правки в `gen.go` исключены (файл — артефакт генерации, перегенерируется).

Альтернатива — `gin-server`/`echo-server`: отвергнута, так как пользователь задал chi.

### 2. Структура пакетов `backend/`
- `main.go` — точка входа: загрузка конфига (`config.go`), инициализация slog, создание in-memory store, сборка StrictServer, монтирование chi-роутера, запуск `http.Server`.
- `internal/config` — структура конфигурации + `envconfig`.
- `internal/store` — in-memory репозиторий (event types, schedule, bookings, guests, owner session, login throttle) с RWMutex.
- `internal/service` — доменная логика (rule-проверки: сетка 15 мин, окно 14 дней, пересечение броней, приоритет расписаний).
- `internal/handler` — реализация `StrictServerInterface`, маппинг ошибок в коды/статусы, установка cookie.
- `api/` — сгенерированный код (`oapi-codegen`).

### 3. Маппинг ошибок
Спецификация задаёт явные `code` (VALIDATION_ERROR, CONTACT_REQUIRED, SLOT_MISALIGNED, SLOT_OUT_OF_WINDOW, SLOT_OUTSIDE_SCHEDULE, EVENT_TYPE_NOT_FOUND, DUPLICATE_EVENT_TYPE_ID, SLOT_BUSY, INVALID_CREDENTIALS, NO_OWNER_SESSION, LOGIN_ATTEMPTS_EXCEEDED, GUEST_UNKNOWN). В `internal/handler` заводим типизированные ошибки (или `error` + sentinel), которые хендлер преобразует в `(code, httpStatus, message)` для возврата `400/404/409/401/429` с телом `{code, message}`.

### 4. Алгоритм свободных слотов (`listSlots`)
Для каждого дня окна (today..today+13 UTC):
1. Выбрать расписание: `availability` типа события, иначе расписание владельца по умолчанию.
2. Для каждого интервала дня сгенерировать кандидаты с шагом 15 мин; отсечь те, чья длительность `durationMinutes` не помещается в интервал целиком.
3. Отсечь кандидаты, пересекающиеся с любой существующей бронью (независимо от типа).
4. Вернуть отсортированный по `startsAt` список `Slot[]` + `windowStartsOn`/`windowEndsOn`.

### 5. Cookie и сессии
- `owner_session` — httpOnly, генерируется при успешном логине (случайный токен, хранится в store), проверяется на защищённых эндпоинтах.
- `guest_id` — httpOnly, выдаётся `POST /guest`; `rememberMe=true` → `Max-Age=30d`, иначе сессионная. В `GET`/`PUT /guest` валидируется наличие профиля.
- Login throttle: счётчик неудач по IP/логину в store; при превышении — 429.

### 6. Конфигурация (envconfig)
Структура `Config`: `OwnerLogin`, `OwnerPassword` (обязательные), `ServerAddr` (напр. `:8080`), `LogLevel` (`info|debug|warn|error`), лимит попыток входа. При нехватке обязательных полей — `log.Fatal` на старте.

### 7. Логирование (slog)
Инициализация `slog` (JSON или text handler) с уровнем из `LogLevel`. Middleware chi логирует метод/путь/статус/длительность; хендлеры логируют контекст ошибок.

## Risks / Trade-offs

- [Генератор меняет имена/типы при обновлении спеки] → Makefile-цель `make generate` пересоздаёт `gen.go` детерминированно; хендлеры зависят только от интерфейса `StrictServerInterface`.
- [In-memory теряет данные при рестарте] → приемлемо для MVP (явный Non-Goal); если потребуется — замена store-имплементации без изменения интерфейса.
- [Конкурентные брони] → единый `sync.RWMutex` в store; проверка занятости и запись брони под одной блокировкой для атомарности.
- [Точность времени UTC] → все вычисления и парсинг ISO 8601 в UTC; серверное «сейчас» берётся в UTC.

## Migration Plan

Новый код изолирован в `backend/`, не влияет на `frontend/`. Сборка и запуск — через Makefile (`make generate`, `make build`, `make run`). Отката не требуется (greenfield).

## Open Questions

- Какой точный лимит неудачных попыток входа перед 429 (например, 5 за N минут)? — можно задать константой/env позже без изменения спеки.
- Формат cookie (Secure флаг в dev) — в dev на http `Secure` не ставим; уточнить при добавлении TLS.
