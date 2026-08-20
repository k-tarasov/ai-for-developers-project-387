## Purpose

Описывает поведение HTTP-API сервиса бронирования «Запись на звонок»: управление типами событий, расписанием владельца, расчётом свободных слотов, созданием бронирований, аутентификацией владельца и профилем гостя. Контракт является источником истины для реализации в `backend/`.

## ADDED Requirements

### Requirement: Event types CRUD
Система SHALL предоставлять эндпоинты `GET /event-types`, `GET /event-types/{eventTypeId}`, `POST /event-types`, `PUT /event-types/{eventTypeId}`, `DELETE /event-types/{eventTypeId}` для управления типами событий (виды брони).

#### Scenario: Создание типа события владельцем
- **WHEN** владелец с валидной сессией `owner_session` создаёт тип события с уникальным slug `id`
- **THEN** система возвращает 201 и созданный `EventType`

#### Scenario: Дубликат slug
- **WHEN** создаётся тип события с уже существующим `id`
- **THEN** система возвращает 409 с `code=DUPLICATE_EVENT_TYPE_ID`

#### Scenario: Создание без сессии владельца
- **WHEN** запрос `POST`/`PUT`/`DELETE` на `/event-types` приходит без валидной сессии владельца
- **THEN** система возвращает 401 с `code=NO_OWNER_SESSION`

#### Scenario: Несуществующий тип события
- **WHEN** запрашивается/обновляется/удаляется тип события с неизвестным `eventTypeId`
- **THEN** система возвращает 404 с `code=EVENT_TYPE_NOT_FOUND`

#### Scenario: Невалидная длина сетки
- **WHEN** `durationMinutes` не кратна 15 или вне диапазона [15, 180], либо `id` не соответствует паттерну `^[a-z0-9]+(-[a-z0-9]+)*$` или длиннее 63
- **THEN** система возвращает 400 с `code=VALIDATION_ERROR`

#### Scenario: Мягкое удаление
- **WHEN** тип события удалён (`DELETE`), но по нему уже есть бронирования
- **THEN** система возвращает 204, существующие брони сохраняются, а новые брони по этому типу невозможны (404)

### Requirement: Owner default schedule
Система SHALL предоставлять `GET /schedule` и `PUT /schedule` для чтения и полной замены недельного расписания владельца по умолчанию.

#### Scenario: Чтение расписания без сессии
- **WHEN** `GET /schedule` приходит без валидной сессии владельца
- **THEN** система возвращает 401 с `code=NO_OWNER_SESSION`

#### Scenario: Замена расписания
- **WHEN** владелец отправляет полное `WeeklySchedule`
- **THEN** система сохраняет его и возвращает 200 с сохранённым расписанием

### Requirement: Slot availability calculation
Система SHALL предоставлять `GET /event-types/{eventTypeId}/slots`, возвращающий свободные слоты длиной `durationMinutes` типа события на окно записи 14 дней (UTC, начиная с сегодняшнего дня включительно).

#### Scenario: Слот внутри рабочих часов
- **WHEN** запрашиваются слоты для типа события
- **THEN** система включает только слоты, целиком помещающиеся в рабочие часы дня (собственное расписание типа события в приоритете над расписанием владельца)

#### Scenario: Запрет пересечения броней
- **WHEN** на время потенциального слота уже есть бронь (любого типа события)
- **THEN** система исключает этот слот из результата

#### Scenario: Сортировка и окно
- **WHEN** возвращается `SlotsResponse`
- **THEN** слоты отсортированы по возрастанию `startsAt`, `windowStartsOn` = сегодня (UTC), `windowEndsOn` = 14-й день включительно

### Requirement: Booking creation by guest
Система SHALL предоставлять `POST /bookings` для создания бронирования гостем и `GET /bookings` для списка предстоящих броней владельцем.

#### Scenario: Успешное бронирование
- **WHEN** гость создаёт бронь с валидным `eventTypeId`, `startsAt` кратным 15 минутам внутри окна 14 дней и свободным слотом, указав `guestName` и хотя бы один контакт (`guestPhone` или `guestEmail`)
- **THEN** система возвращает 201 с `Booking`, содержащим снимок `BookingEventType` на момент брони

#### Scenario: Некратное начало
- **WHEN** `startsAt` не кратно 15 минутам
- **THEN** система возвращает 400 с `code=SLOT_MISALIGNED`

#### Scenario: Вне окна записи
- **WHEN** `startsAt` находится вне окна 14 дней
- **THEN** система возвращает 400 с `code=SLOT_OUT_OF_WINDOW`

#### Scenario: Вне расписания / занято
- **WHEN** `startsAt` не попадает в рабочие часы дня либо пересекается с существующей бронью
- **THEN** система возвращает 400 с `code=SLOT_OUTSIDE_SCHEDULE` или 409 с `code=SLOT_BUSY` соответственно

#### Scenario: Контакт обязателен
- **WHEN** в `BookingCreate` не указан ни `guestPhone`, ни `guestEmail`
- **THEN** система возвращает 400 с `code=CONTACT_REQUIRED`

#### Scenario: Список предстоящих броней
- **WHEN** владелец с валидной сессией запрашивает `GET /bookings`
- **THEN** система возвращает 200 со списком броней с `startsAt >= now`, отсортированным по возрастанию `startsAt`

### Requirement: Owner authentication
Система SHALL предоставлять `POST /auth/login`, проверяющий `login`/`password` из конфигурации сервера и выдающий httpOnly cookie `owner_session` при успехе.

#### Scenario: Успешный вход
- **WHEN** переданы корректные `OWNER_LOGIN` и `OWNER_PASSWORD`
- **THEN** система возвращает 200 `AuthSuccess` и устанавливает httpOnly cookie `owner_session`

#### Scenario: Неверные данные
- **WHEN** переданы неверные учётные данные
- **THEN** система возвращает 401 с `code=INVALID_CREDENTIALS`

#### Scenario: Превышен лимит попыток
- **WHEN** превышено количество неудачных попыток входа (throttle)
- **THEN** система возвращает 429 с `code=LOGIN_ATTEMPTS_EXCEEDED`

### Requirement: Guest profile and identification
Система SHALL предоставлять `GET /guest`, `POST /guest`, `PUT /guest` для идентификации и профиля гостя по httpOnly cookie `guest_id`.

#### Scenario: Идентификация гостя
- **WHEN** гость вызывает `POST /guest` с `name` и хотя бы одним контактом и `rememberMe=true`
- **THEN** система возвращает 201 `GuestProfile` и устанавливает cookie `guest_id` со сроком 30 дней; при `rememberMe=false` — сессионную cookie

#### Scenario: Неизвестная cookie
- **WHEN** `GET`/`PUT /guest` приходит без валидной cookie `guest_id`
- **THEN** система возвращает 404 с `code=GUEST_UNKNOWN`

#### Scenario: Обновление профиля
- **WHEN** гость с валидной cookie `guest_id` вызывает `PUT /guest`
- **THEN** система обновляет и возвращает 200 с обновлённым `GuestProfile`

### Requirement: In-memory storage
Система SHALL хранить все данные (типы событий, расписание, брони, профили гостей, сессию владельца, счётчик попыток входа) исключительно в памяти процесса; данные не сохраняются между перезапусками.

#### Scenario: Перезапуск очищает данные
- **WHEN** сервер перезапускается
- **THEN** все ранее созданные записи отсутствуют, хранилище начинается пустым (кроме статической конфигурации владельца)

### Requirement: Configuration via envconfig
Система SHALL загружать параметры окружения (`OWNER_LOGIN`, `OWNER_PASSWORD`, адрес сервера, уровень логирования и т.п.) через `github.com/kelseyhightower/envconfig` при старте.

#### Scenario: Старт с обязательными параметрами
- **WHEN** заданы `OWNER_LOGIN` и `OWNER_PASSWORD`
- **THEN** сервер стартует и использует их для аутентификации владельца

#### Scenario: Отсутствие обязательных параметров
- **WHEN** не задан один из обязательных параметров
- **THEN** сервер завершает старт с ошибкой конфигурации

### Requirement: Structured logging
Система SHALL вести логирование через `log/slog` (структурированные логи) с уровнем, настраиваемым через конфигурацию окружения.

#### Scenario: Логирование запросов и ошибок
- **WHEN** обрабатывается запрос или возникает ошибка
- **THEN** в лог попадает структурированная запись slog с контекстом (метод, путь, статус, сообщение ошибки)
