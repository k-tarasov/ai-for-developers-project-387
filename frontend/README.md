# Фронтенд «Запись на звонок»

Веб-интерфейс сервиса записи на звонок (React 19 + TypeScript + Vite). Гость бронирует
свободные слоты, владелец управляет типами событий, расписанием и просматривает предстоящие
брони. Обмен данными с бэкендом — только по HTTP API из контракта `spec/main.tsp` (OpenAPI).

## Стек

- Vite + React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- React Router — маршрутизация
- TanStack Query — запросы/кэш/состояния загрузки и ошибок
- openapi-fetch + openapi-typescript — типобезопасный клиент, сгенерированный из контракта
- Vitest + Testing Library — тесты

## Требования

- Node.js (версия, указанная в `package.json` / `.npmrc`)

## Установка

```bash
cd frontend
npm install
```

Перед первым запуском (или после изменения контракта) сгенерируйте типы API:

```bash
npm run generate:api
```

## Переменные окружения

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Базовый URL API. В dev — `/api` (прокси Vite на `http://localhost:8080`). В mock-режиме — `http://localhost:4010` (Prism). | `/api` |
| `VITE_USE_MOCKS` | `true` — использовать локальные моки фронтенда (`src/api/queries.mock.ts`) вместо реального API. Любое другое значение — реальный API. | не задано |

Конфигурация лежит в `.env` (dev) и `.env.mock` (mock-режим); Vite подхватывает нужный файл
сам (см. скрипты ниже).

## Команды

```bash
npm run dev        # dev-сервер (Vite). API → /api, проксируется на http://localhost:8080.
npm run dev:mock   # Vite + Prism: запросы идут на mock-сервер Prism (порт 4010) по контракту.
npm run build      # сборка продакшен-бандла (tsc -b && vite build).
npm run preview    # предпросмотр собранного бандла.
npm run lint       # ESLint.
npm run test       # Vitest (прогон тестов один раз).
npm run format     # Prettier (форматирование).
npm run generate:api # Перегенерация типов TS из OpenAPI-контракта.
npm run mock:api   # Только Prism mock-сервер (без Vite).
```

### Режим разработки с бэкендом

Бэкенд запускается отдельным процессом на `http://localhost:8080`. Vite проксирует `/api` на
него, поэтому CORS не требуется. Базовый адрес задаётся `VITE_API_BASE_URL=/api` (`.env`).

### Режим mock (без бэкенда)

`npm run dev:mock` поднимает Prism над OpenAPI-файлом (`spec/tsp-output`) и Vite, направляя
запросы на `http://localhost:4010`. Основные сценарии (список типов, слоты, создание брони,
админка) воспроизводимы без реального бэкенда. Данные — примеры из контракта.

Вместо Prism можно использовать локальные моки фронтенда: `VITE_USE_MOCKS=true`
(в `.env` уже выставлено) — тогда запросы обрабатываются модулем `src/api/queries.mock.ts`.

## Структура

- `src/api/` — клиент API, разбор ошибок по кодам контракта, моки и роутер запросов
- `src/pages/` — страницы (гость и владелец)
- `src/components/` — UI-компоненты (`ui/` — shadcn, `weekly-schedule-editor`)
- `src/app/` — router и layout
- `src/lib/` — утилиты (форматирование UTC, работа с расписанием)

## Тестирование

Тесты (`*.test.tsx`) рендерят страницы с мок-клиентом (`vi.mock('@/api/queries')`),
проверяют сценарии ошибок по кодам контракта и клиентскую валидацию контакта.

```bash
npm run test
```
