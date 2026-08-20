### Hexlet tests and linter status:
[![Actions Status](https://github.com/k-tarasov/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/k-tarasov/ai-for-developers-project-387/actions)

## Агентская разработка через GitHub Actions

Репозиторий использует [OpenCode GitHub-интеграцию](https://opencode.ai/docs/github/) для участия агента в цикле разработки. Агент запускается в раннере GitHub Actions на встроенном `GITHUB_TOKEN` — отдельный GitHub App не нужен.

### Как работает процесс

| Шаг | Что происходит |
| --- | --- |
| Создание issue | Workflow `issue-triage.yml` автоматически запускает агента: он анализирует задачу, задаёт уточняющие вопросы (если нужно) и предлагает следующий шаг. |
| Команда `/implement` | Комментарий `/implement` в issue запускает `implement-from-issue.yml`: агент реализует задачу, создаёт ветку `agent/<issue-number>-<slug>` и открывает PR с `Closes #<issue-number>`. Повторная команда обновляет существующий PR. |
| Ревью PR | Комментарий `/review-fix` (в PR или на строки кода) запускает `pr-review-respond.yml`: агент вносит правки по замечаниям ревью в тот же PR. |
| Ночная проверка | Workflow `nightly-lighthouse.yml` (ежедневно в 01:00 UTC и по `workflow_dispatch`) гоняет Lighthouse против `PROD_URL` и сохраняет отчёт артефактом; при провале открывает issue. |

### Настройка

1. **API-ключ модели агента** — в Settings → Secrets and variables → Actions добавьте секрет под выбранного провайдера (например, `ANTHROPIC_API_KEY`).
2. **Модель** — переменная репозитория `OPENCODE_MODEL` в формате `provider/model` (по умолчанию `anthropic/claude-sonnet-4-20250514`).
3. **Продакшн-URL для ночной проверки** — переменная репозитория `PROD_URL` (например, `https://example.com`). Если не задана, ночной workflow пропускает проверку.
4. **Порог производительности** — переменная `LH_PERF_THRESHOLD` (по умолчанию `80`).

### Права

Workflow агента запрашивают минимальные права: `issues: write`, `pull-requests: write`, `contents: write`, `id-token: write`.

## Команды

Все команды — через корневой `Makefile`. Смотри доступные цели в нём, а не угадывай команды напрямую.

Фронтенд: `make lint` / `make test` / `make build` / `make dev` / `make dev-mock` / `make format` / `make e2e`.
Бэкенд: `make be-lint` / `make be-test` / `make be-build` / `make be-run` / `make be-generate` / `make be-docker-build`.
Спека (TypeSpec → OpenAPI): `make spec`.

Типовой порядок проверки перед завершением работы: линтер -> тесты -> сборка.