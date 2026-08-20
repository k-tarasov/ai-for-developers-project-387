## Context

Продукт реализован (см. proposal.md — Why). В репозитории уже есть `ci.yml`, `release-please.yml`, `hexlet-check.yml` — они не меняются. GitHub App не установлен (проверено: endpoint `installation` возвращает 401), поэтому агент запускается в контейнере GitHub Actions с `GITHUB_TOKEN`. В корне проекта есть `opencode.json` (MCP shadcn/render) и Makefile; стек: `backend/` (Go), `frontend/` (React/Node), `spec/` (TypeSpec).

## Goals / Non-Goals

**Goals:**
- Агент в GitHub Actions отвечает на новые issue (triage).
- Команда `/implement` в issue → агент создаёт PR.
- Доработка PR после ревью по команде.
- Ночной Lighthouse-прогон против прод-URL с отчётом.
- Минимальные права workflow.

**Non-Goals:**
- Установка и настройка OpenCode GitHub App (явно исключено; агент работает в CI).
- Изменение продуктового кода и существующих workflow (`ci.yml`, `release-please.yml`, `hexlet-check.yml`).
- Изменение конфигурации MCP в `opencode.json`.

## Decisions

**1. Запуск агента через официальный composite action `anomalyco/opencode/github@latest`.**
Action сам скачивает/кэширует opencode (`opencode github run`) и принимает `model`, `prompt`, `mentions`, `use_github_token`. GitHub App не нужен: при `use_github_token: true` и наличии прав `id-token: write`, `contents: write`, `pull-requests: write`, `issues: write` action работает от встроенного `GITHUB_TOKEN` (docs: https://opencode.ai/docs/github/).
*Альтернатива:* самописный composite action + контейнер `ghcr.io/sst/opencode` (образа не существует) + ручная логика веток/PR через `gh`. Отклонено: много кода и рисков при наличии поддерживаемой официальной интеграции.

**2. Отдельный workflow на каждый сценарий.**
Триггеры разные (`issues: opened`, `issue_comment`, `pull_request_review` / `pull_request_review_comment`, `schedule`), поэтому делаем 4 отдельных файла:
- `issue-triage.yml` — на `issues: opened`;
- `implement-from-issue.yml` — на `issue_comment` с командой `/implement`;
- `pr-review-respond.yml` — на ревью PR;
- `nightly-lighthouse.yml` — на `schedule` (cron) + `workflow_dispatch`.

**3. Повторная команда `/implement` обновляет существующий PR.**
Официальная интеграция при `issue_comment` с командой сама решает, что делать: для issue создаёт ветку/PR, при повторной команде агент находит открытый PR по issue и обновляет его. Задаём стабильные имена веток через prompt (`agent/<issue-number>-<slug>`), чтобы избежать дублей.

**4. Реагирование на ревью — по явной команде.**
Чтобы не пушить на каждое ревью без спроса, workflow слушает `pull_request_review_comment` и `issue_comment` на PR с командой `/review-fix` (передаётся через `mentions`). Агент читает комментарии ревью (официальная интеграция получает файл, строки и diff-контекст), вносит правки, коммитит в ту же ветку.
*Альтернатива:* авто-ответ на каждый review event без команды. Отклонено — слишком инвазивно и непредсказуемо для командной работы.

**5. Lighthouse: локальный запуск через lighthouse CI-образ + публикация отчёта.**
Используем официальный контейнер Lighthouse (`googlechrome/lighthouse-ci` или `lhci/cli` в ноде). Прод-URL — переменная workflow (secrets/vars), например `PROD_URL`. Отчёт сохраняется артефактом (`actions/upload-artifact`) и дублируется в issue (`gh issue create`) при провале или всегда по параметру.
*Альтернатива:* Lighthouse-деплой через `lighthouse-badges`. Отклонено — лишняя зависимость, артефакт+issue достаточно.

**6. Промпты и команды — параметры официального action.**
Триггерные фразы и кастомные промпты передаются через входы `mentions` и `prompt` action `anomalyco/opencode/github`. Промпты для сценариев задаются inline в workflow-файлах: triage, implement, review-fix. Это не дублирует логику в YAML и не требует отдельных скриптов.

## Risks / Trade-offs

- **`GITHUB_TOKEN` от workflow не может триггерить другие workflow** → PR-пуши от агента не запустят `ci.yml`/`release-please` из-за правил GitHub (no event from GITHUB_TOKEN). Принять: CI для PR-веток можно запустить отдельным `pull_request` workflow или через PAT при необходимости. Для учебного процесса достаточно текущих проверок.
- **Отсутствие прод-URL** → ночной Lighthouse будет завершаться с понятной ошибкой (см. spec «Отсутствие сконфигурированного URL»). Настраивается через переменную/секрет.
- **Поведение агента в CI может быть недетерминированным** → промпты фиксированные, входные данные ограничены (только текст issue/ревью), выходные артефакты ограничены scope workflow.
- **Ночной прогон Lighthouse на GitHub-hosted runner не стабилен по сети** → повтор одной проверки (retry) и пороговые значения, чтобы избежать ложных падений.
- **Команда `/implement` от неавторизованных пользователей** → для частных репо событие `issue_comment` приходит только от участников; при необходимости добавить проверку роли автора.

## Migration Plan

1. Добавить 4 workflow-файла (официальный action `anomalyco/opencode/github@latest` в трёх из них).
2. Настроить секрет с API-ключом модели агента и переменную/секрет `PROD_URL`.
3. Вручную проверить сценарии: создать тестовый issue → дождаться ответа → `/implement` → дождаться PR → ревью → `/review-fix` → дождаться доработок.
4. Ночной прогон проверить через `workflow_dispatch` до срабатывания cron.

Откат: удаление workflow-файлов (CI-артефакты не влияют на продуктовый код). Ночной прогон не блокирует main.

## Open Questions

- Какой провайдер/модель используется для агента (например, `anthropic/claude-sonnet-4-20250514`) и какой секрет хранит API-ключ (`ANTHROPIC_API_KEY` и т.п.) — задаётся при настройке workflow, без изменения спек.
- Нужен ли отдельный параметр `LHCI_TOKEN` для хранения истории результатов — можно решить позже без изменения спек.