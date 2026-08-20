## Why

Продукт (сервис бронирования слотов) реализован, но команда хочет встроить агентскую разработку в реальный цикл GitHub: от issue до PR, ревью и регулярных проверок. Сейчас в репозитории нет ни одного workflow, который бы позволял агенту реагировать на issue, создавать PR по команде, дорабатывать PR после ревью или регулярно проверять прод (Lighthouse). Без этой обвязки агент не может участвовать в командном процессе.

## What Changes

- Добавить workflow, который автоматически отвечает в новых issue (triage/разбор задачи агентом): краткий анализ, уточняющие вопросы, оценка. Запускается на событии `issues: opened`.
- Добавить workflow, который по команде `/implement` (или аналогичной) в комментарии к issue создаёт PR: агент формирует ветку, вносит правки, открывает PR с описанием.
- Добавить workflow, который реагирует на ревью PR: по запросу вносит доработки в тот же PR.
- Добавить scheduled workflow (ночью), который запускает Lighthouse против продакшн-URL и публикует отчёт (артефакт + comment/issue).
- Агент работает в контейнере GitHub Actions с `GITHUB_TOKEN` — без установки отдельного GitHub App.

## Capabilities

### New Capabilities
- `github-workflows`: Набор GitHub Actions, обеспечивающих участие агента в цикле разработки: ответ и triage в issue, создание PR по команде, доработка PR после ревью, ночные регулярные проверки (Lighthouse) с отчётом.

### Modified Capabilities

## Impact

- `.github/workflows/` — новые workflow-файлы (issue-triage, implement-from-issue, pr-review-respond, nightly-lighthouse).
- Docker-конфигурация для запуска агента в CI (использование существующего образа opencode или сборка из репозитория).
- Прод-URL для Lighthouse — должен быть известен/сконфигурирован (переменная или переменная секрета).
- Существующие `ci.yml`, `release-please.yml`, `hexlet-check.yml` не меняются.
- Права workflow: `issues: write`, `pull-requests: write`, `contents: write`.