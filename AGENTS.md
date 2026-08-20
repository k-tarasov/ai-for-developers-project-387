# AGENTS.md

Инструкции для ИИ-агентов (OpenCode и др.). Общение и документация — на русском языке.

## Структура проекта

Монорепозиторий из двух независимых частей:

- `frontend/` — React 19 (Node.js)
- `backend/` — Go

Изменения в одной части не должны ломать другую. Не смешивай правки frontend и backend в одной задаче без необходимости.

## Команды

Все команды — через корневой `Makefile`. Перед запуском смотри доступные цели в нём, а не угадывай команды напрямую. Прямые вызовы (`npm run`, `go test`) — только если подходящей цели в Makefile нет.

Фронтенд: `make lint` / `make test` / `make build` / `make dev` / `make dev-mock` / `make format` / `make e2e`.
Бэкенд: `make be-lint` / `make be-test` / `make be-build` / `make be-run` / `make be-generate` / `make be-docker-build`.
Спека (TypeSpec → OpenAPI): `make spec`.

Типовой порядок проверки перед завершением работы: линтер -> тесты -> сборка.

## CI

`.github/workflows/hexlet-check.yml` — авто-генерированный файл Hexlet. Не редактируй и не удаляй его.
