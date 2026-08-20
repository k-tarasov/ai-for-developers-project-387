## 1. Общая инфраструктура

- [x] 1.1 Зафиксировать официальный composite action `anomalyco/opencode/github@latest` и входы (`model`, `prompt`, `mentions`, `use_github_token`) — по документации https://opencode.ai/docs/github/
- [x] 1.2 Определить параметры запуска: `use_github_token: true`, права workflow `issues: write`, `pull-requests: write`, `contents: write`, `id-token: write`
- [x] 1.3 Определить модель агента и секрет API-ключа (например, `ANTHROPIC_API_KEY` / `anthropic/claude-sonnet-4-20250514`) как конфигурируемые параметры workflow
- [x] 1.4 Убедиться, что все workflow запрашивают минимальные права `issues: write`, `pull-requests: write`, `contents: write`

## 2. Ответ агента в issue (triage)

- [x] 2.1 Создать `.github/workflows/issue-triage.yml` на событие `issues: opened`
- [x] 2.2 Задать промпт для триажа: краткий анализ задачи, уточняющие вопросы, предложение `/implement`
- [x] 2.3 Убедиться, что ответ агента публикуется комментарием в issue (официальная интеграция делает это автоматически)
- [ ] 2.4 Проверить сценарии спек: «Новый issue без уточнений» и «Новый issue с неоднозначной задачей» (агент не реализует, пока не получит ответы)

## 3. Создание PR агентом по команде из issue

- [x] 3.1 Создать `.github/workflows/implement-from-issue.yml` на событие `issue_comment` (тип `created`) с командой `/implement` через `mentions`
- [x] 3.2 Реализовать промпт, указывающий агенту создавать/обновлять ветку `agent/<issue-number>-<slug>` и не дублировать существующий открытый PR
- [x] 3.3 Реализовать создание PR с описанием и `Closes #<issue-number>` (официальная интеграция создаёт ветку, коммитит и открывает PR)
- [ ] 3.4 Проверить сценарии спек: «Команда /implement в issue» и «Повторная команда в том же issue»

## 4. Доработка PR после ревью

- [x] 4.1 Создать `.github/workflows/pr-review-respond.yml` на события `pull_request_review_comment` и `issue_comment` на PR с командой `/review-fix` через `mentions`
- [x] 4.2 Задать промпт, указывающий агенту анализировать комментарии ревью и вносить правки в тот же PR
- [x] 4.3 Реализовать ответ в PR/issue в случае отсутствия открытого PR (сценарий «Отсутствие открытого PR») — через prompt: агент сообщает, что PR не найден, и не выполняет изменений

## 5. Ночная регулярная проверка (Lighthouse)

- [x] 5.1 Создать `.github/workflows/nightly-lighthouse.yml` на `schedule` (cron, ночь) и `workflow_dispatch`
- [x] 5.2 Настроить переменную/секрет `PROD_URL` для продакшн-URL; при отсутствии — завершаться с понятной ошибкой (сценарий «Отсутствие сконфигурированного URL»)
- [x] 5.3 Реализовать запуск Lighthouse (официальный контейнер или `lhci`) против `PROD_URL` с retry и пороговыми значениями
- [x] 5.4 Сохранять отчёт артефактом (`actions/upload-artifact`) и публиковать в issue при провале или по параметру (сценарий «Провал проверки»)
- [ ] 5.5 Проверить запуск вручную через `workflow_dispatch` до ожидания cron (сценарий «Ночной запуск по расписанию»)

## 6. Документация и проверка

- [x] 6.1 Добавить краткую документацию в README (или docs): как работает процесс, команды `/implement` и `/review-fix`, как настроить `PROD_URL` и API-ключ
- [ ] 6.2 Прогнать сценарии e2e вручную: issue → ответ → `/implement` → PR → ревью → `/review-fix` → доработки → ночной отчёт
- [x] 6.3 Убедиться, что `ci.yml`, `release-please.yml`, `hexlet-check.yml` не изменены