## 1. Инициализация модуля и генерация кода

- [x] 1.1 Создать `backend/go.mod`, инициализировать модуль, добавить зависимости: `go-chi/chi/v5`, `oapi-codegen/v2`, `kelseyhightower/envconfig`, `google/uuid`, `stretchr/testify` (тесты).
- [x] 1.2 Добавить `backend/api/oapi-codegen.yaml` (опции `chi-server, types, strict-server, embedded-spec`, package `api`, output `backend/api/gen.go`) на основе `spec/tsp-output/@typespec/openapi3/openapi.yaml`.
- [x] 1.3 Сгенерировать `backend/api/gen.go` и проверить, что он компилируется (`go build ./...`).
- [x] 1.4 Добавить корневой `Makefile` с целями `generate` (oapi-codegen), `build`, `run`, `test`, `lint` согласно соглашениям репозитория.

## 2. Конфигурация и логирование

- [x] 2.1 Реализовать `internal/config` со структурой `Config` и загрузкой через `envconfig` (`OWNER_LOGIN`, `OWNER_PASSWORD` обязательные; `SERVER_ADDR`, `LOG_LEVEL`, лимит попыток входа).
- [x] 2.2 При нехватке обязательных полей — `log.Fatal` на старте.
- [x] 2.3 Инициализировать `log/slog` с уровнем из конфигурации (JSON handler).
- [x] 2.4 Добавить chi-middleware для логирования метода/пути/статуса/длительности.

## 3. In-memory хранилище

- [x] 3.1 Реализовать `internal/store` с потокобезопасным (RWMutex) репозиторием: типы событий (map по id), расписание владельца, брони (map по uuid), профили гостей (map по guest_id), сессия владельца (map token→bool), счётчик попыток входа.
- [x] 3.2 Методы store: CRUD типов событий, get/update schedule, create/list bookings, create/get/update guest, create/validate owner-session, инкремент/проверка throttle.
- [x] 3.3 Атомарная операция «проверка занятости + создание брони» под одной блокировкой.

## 4. Доменная логика (service)

- [x] 4.1 Реализовать валидацию `durationMinutes` (кратность 15, диапазон [15,180]) и паттерна `id` slug.
- [x] 4.2 Реализовать алгоритм `listSlots`: окно 14 дней UTC, выбор расписания (availability типа > расписание владельца), генерация кандидатов с шагом 15 мин, отсев не влезающих в интервал и пересекающихся с бронями, сортировка по `startsAt`.
- [x] 4.3 Реализовать проверки создания брони: кратность 15 мин (`SLOT_MISALIGNED`), окно 14 дней (`SLOT_OUT_OF_WINDOW`), попадание в рабочие часы (`SLOT_OUTSIDE_SCHEDULE`), отсутствие пересечения (`SLOT_BUSY`), обязательный контакт (`CONTACT_REQUIRED`).
- [x] 4.4 Типизированные ошибки/handler-маппинг в `(code, status, message)` по схемам спецификации.

## 5. Хендлеры (реализация StrictServerInterface)

- [x] 5.1 `EventTypes`: list, get, create (409 при дубликате), update (игнор id в теле), delete (мягкое удаление, 404 на новые брони).
- [x] 5.2 `Schedule`: get (401 без сессии), update (полная замена, 400 при невалидном).
- [x] 5.3 `Bookings`: create (гость, проверки 4.3, снимок `BookingEventType`), list (владелец, 401, фильтр `startsAt >= now`, сортировка).
- [x] 5.4 `Auth`: login (сверка с конфигом, выдача httpOnly `owner_session`, 401/429 по throttle).
- [x] 5.5 `Guest`: get (404 без cookie), create (выдача `guest_id`, 30d при `rememberMe`, 400 без контакта), update (404 без валидной cookie).
- [x] 5.6 Защита эндпоинтов владельца: проверка `owner_session` → 401 `NO_OWNER_SESSION`.

## 6. Сборка и запуск

- [x] 6.1 Реализовать `main.go`: сборка store → service → handler → `HandlerFromMux`, запуск `http.Server` на `SERVER_ADDR`.
- [x] 6.2 `go build ./...` и `go vet ./...` проходят без ошибок.
- [x] 6.3 Ручная проверка сценариев: создание типа события, получение слотов, бронирование, логин владельца, профиль гостя.

## 7. Тесты

- [x] 7.1 Юнит-тесты `internal/service`: сетка 15 мин, окно 14 дней, пересечение броней, приоритет расписаний.
- [x] 7.2 Интеграционные тесты хендлеров (httptest + chi): покрытие кодов ошибок 400/404/409/401/429 из спецификации.
- [x] 7.3 `go test ./...` зелёный.
