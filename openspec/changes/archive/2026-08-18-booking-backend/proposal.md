## Why

Проект описывает сервис бронирования («Запись на звонок») в TypeSpec, из которого уже сгенерирована OpenAPI-спецификация (`spec/tsp-output/@typespec/openapi3/openapi.yaml`). Бэкенд-приложение ещё не существует (`backend/` отсутствует). Нужно реализовать рабочий Go-сервер, полностью соответствующий этой спецификации: CRUD типов событий, расписание владельца, расчёт свободных слотов, создание бронирований, аутентификация владельца и профиль гостя — с хранением данных в памяти.

## What Changes

- Создаётся новый модуль Go в `backend/` (`go.mod`, пакет `main`).
- Генерируется серверный код из `openapi.yaml` через `oapi-codegen` (strict-server, chi-роутер, types+server-interface+chi-handlers).
- Реализуются хендлеры всех эндпоинтов спецификации:
  - `EventTypes`: list/get/create/update/delete, listSlots
  - `Schedule`: get/update (расписание владельца по умолчанию)
  - `Bookings`: create/list
  - `Auth`: login (httpOnly cookie `owner_session`, throttle попыток)
  - `Guest`: get/create/update (httpOnly cookie `guest_id`)
- Доменная логика: окно записи 14 дней (UTC), сетка 15 минут, пересечение броней запрещено, приоритет собственного расписания типа события над расписанием владельца, валидация ошибок (400/404/409/401/429) согласно схемам `code`.
- In-memory хранилище (event types, schedule, bookings, guests, owner session, login-throttle) без внешней БД.
- Конфигурация через `github.com/kelseyhightower/envconfig`: `OWNER_LOGIN`, `OWNER_PASSWORD`, `SERVER_ADDR`, `LOG_LEVEL` и т.п.
- Логирование через `log/slog`.
- Makefile-цели для генерации кода и сборки (по соглашению репозитория).

## Capabilities

### New Capabilities
- `booking-api`: полное поведение HTTP-API сервиса бронирования — эндпоинты, коды ошибок, правила занятости, окно записи, аутентификация владельца и идентификация гостя — как оно должно предоставляться реализацией в `backend/`.

### Modified Capabilities
<!-- Нет существующих capability с изменяющимися требованиями -->

## Impact

- Новый код: `backend/` (Go, chi, oapi-codegen, envconfig, slog).
- Новые зависимости Go: `github.com/go-chi/chi/v5`, `github.com/oapi-codegen/*`, `github.com/kelseyhightower/envconfig`, `github.com/google/uuid`, `github.com/deepmap/oapi-codegen` (или `github.com/oapi-codegen/oapi-codegen/v2`).
- Зависимость от существующей `spec/tsp-output/@typespec/openapi3/openapi.yaml` (источник генерации).
- Не затрагивает `frontend/`.
