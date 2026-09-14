# Сервис бронирования встреч

[![Actions Status](https://github.com/k-tarasov/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/k-tarasov/ai-for-developers-project-387/actions)

Работающий сервис: [приложение на Render](https://ai-for-developers-project-386-17d4.onrender.com/).

Приложение позволяет выбирать тип встречи и свободное время, создавать бронирование и управлять расписанием владельца. Монорепозиторий включает React frontend (`frontend/`), Go backend (`backend/`) и контракт TypeSpec/OpenAPI (`spec/`). Docker обслуживает приложение на порту 8080.

## План развития

| Задача | Ожидаемый результат | Обсуждение и реализация |
| --- | --- | --- |
| Фича: меню владельца в правой части панели | Вход, управление типами встреч, расписанием и бронями доступны через выпадающее меню справа | [Issue #1](https://github.com/k-tarasov/ai-for-developers-project-387/issues/1), [PR #3](https://github.com/k-tarasov/ai-for-developers-project-387/pull/3) |
| Баг: устаревшие слоты других типов встреч после бронирования | После успешного бронирования обновляется кэш слотов всех типов встреч; поведение защищено регрессионными тестами | [Issue #5](https://github.com/k-tarasov/ai-for-developers-project-387/issues/5), [PR #7](https://github.com/k-tarasov/ai-for-developers-project-387/pull/7) |

## Работа с агентами

Во всех шести агентных workflow используется OpenCode (`anomalyco/opencode/github@latest`). Модель задаётся переменной репозитория `OPENCODE_MODEL`; значение по умолчанию — `opencode/big-pickle`. Исходные итерации в PR #3 и #7 выполнены этой моделью. API-ключ хранится в секрете `OPENCODE_API_KEY`.

| Workflow | Событие / команда | Назначение |
| --- | --- | --- |
| [opencode.yml](.github/workflows/opencode.yml) | Новый общий или построчный комментарий с `/oc <запрос>` или `/opencode <запрос>` | Интерактивный анализ задачи и выполнение запроса участника с правом запуска |
| [issue-triage.yml](.github/workflows/issue-triage.yml) | Создание issue (`issues.opened`), автор — не бот | Краткий анализ, оценка сложности, уточняющие вопросы или предложение вызвать `/implement` |
| [implement-from-issue.yml](.github/workflows/implement-from-issue.yml) | Комментарий `/implement [уточнения]` в issue | Реализация задачи, проверки и PR со ссылкой `Closes #N` |
| [pr-review-autostart.yml](.github/workflows/pr-review-autostart.yml) | Открытие, обновление, повторное открытие PR или перевод из draft в ready | Автоматическое ревью PR из текущего репозитория, включая PR агентов; без изменения кода |
| [pr-review-respond.yml](.github/workflows/pr-review-respond.yml) | `/review-fix [уточнения]` в общем или построчном комментарии PR | Обработка обоих каналов ревью и исправляющий коммит в той же ветке |
| [nightly-lighthouse.yml](.github/workflows/nightly-lighthouse.yml) | Ежедневно в 01:00 UTC (04:00 МСК) или ручной `workflow_dispatch` | Агент запускает Lighthouse, анализирует показатели и при проблеме создаёт/обновляет issue |

Интерактивные команды доступны авторам комментариев с `OWNER`, `MEMBER` или `COLLABORATOR`; комментарии ботов их не запускают. OpenCode дополнительно проверяет права инициатора. Тексты issues, diff и чужих комментариев используются как данные, а не как источник произвольных команд.

### Авторизация и настройки

- Workflow используют `use_github_token: true`: OpenCode работает с `GITHUB_TOKEN` и правами конкретной job. Триажу оставлены `id-token: write` и `issues: write`; публичный Git checkout выполняется без токена. Авторевью получает `id-token: write`, `contents: read`, `pull-requests: write`.
- `id-token: write` объявлен для совместимости с OIDC, но при `use_github_token: true` обмен OIDC пропускается. Для перехода на OIDC нужен установленный OpenCode GitHub App с доступом к репозиторию и `use_github_token: false`; права токена приложения определяются установкой приложения, а не только блоком `permissions`. См. [документацию OpenCode](https://opencode.ai/docs/github/).
- В настройках Actions должно быть разрешено создание pull requests с `GITHUB_TOKEN`. Для PR, созданных или обновлённых этим токеном, GitHub может потребовать **Approve workflows to run**; проверяйте Actions перед слиянием. [Поведение GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token).
- Авторевью PR из форков пропускается: событие `pull_request` не предоставляет им секрет модели. Такие PR проверяются человеком.
- `PROD_URL` — URL развёрнутого сервиса; сейчас это ссылка на Render выше. `LH_PERF_THRESHOLD` — допустимый минимум performance от 0 до 100, по умолчанию 80. Отсутствующий URL или некорректный порог завершают ночную проверку ошибкой.
- Ночной отчёт содержит JSON Lighthouse и `summary.md` с выводами агента. Артефакт `lighthouse-report` хранится 14 дней. Техническая ошибка или performance ниже порога приводит к неуспешному запуску и issue «Ночной аудит Lighthouse: требуется внимание». При повторном сбое агент обновляет существующую открытую issue своего бота.

### Коммиты и проверки

Правило для **всех новых коммитов и заголовков PR** закреплено в [AGENTS.md](AGENTS.md#коммиты-и-pull-requests): Conventional Commits, например `feat(layout): добавить меню владельца` или `fix(frontend): обновить кэш слотов`. Оно также явно включено в промпты `/oc`, `/implement` и `/review-fix`. Старые опубликованные коммиты не переписываются; для их PR при слиянии используется корректно названный squash-коммит.

Команды запускаются из корня через Makefile. После установки зависимостей frontend (`npm ci` в `frontend/`, отдельной make-цели установки нет):

```sh
make lint
make test
make build
make be-lint
make be-test
make be-build
make e2e
```

CI проверяет обе части и E2E. После слияния в `main` [release-please](.github/workflows/release-please.yml) обновляет релизный PR по Conventional Commits. Слияние релизного PR публикует релиз. Автоматический `hexlet-check.yml` не редактируется.

## Самооценка итераций с агентом

1. **Фича из issue #1.** Агент разобрал краткий запрос о панели и подготовил [PR #3](https://github.com/k-tarasov/ai-for-developers-project-387/pull/3). Реализация появилась быстро, но сообщение коммита и заголовок PR оказались непригодны для Conventional Commits. Вывод: формат коммитов должен быть явным правилом в AGENTS.md и промпте, а не ожиданием от модели.
2. **Баг из issue #5.** После триажа и команды реализации агент подготовил [PR #7](https://github.com/k-tarasov/ai-for-developers-project-387/pull/7) с инвалидацией слотов всех типов встреч. Первоначальные lint, тесты и сборка прошли, но нового теста на саму регрессию не было. Зелёного CI недостаточно без проверки покрытия сценария.
3. **Два канала ревью.** В PR #7 оставлены [общее замечание о тестах](https://github.com/k-tarasov/ai-for-developers-project-387/pull/7#issuecomment-5665282073) и [замечание к строке diff о ключах кэша](https://github.com/k-tarasov/ai-for-developers-project-387/pull/7#discussion_r4006017053), затем вызван [/review-fix](https://github.com/k-tarasov/ai-for-developers-project-387/pull/7#issuecomment-5665282858). Критерий завершения: агент обработал оба замечания, добавил коммит в прежнюю ветку, проверки прошли.
4. **Доработка автоматизации.** Исправлены событие и права триажа, авторевью допускает PR агентов, ночная проверка включает AI-анализ. Человек проверяет diff, реальные результаты тестов и готовность к слиянию; заявления агента сами по себе не считаются подтверждением.

Финальная проверка итерации: исправления находятся в той же ветке PR, проверенный PR слит в `main`, а [релизный PR #2](https://github.com/k-tarasov/ai-for-developers-project-387/pull/2) обновлён release-please. Ссылки выше позволяют проверить результат непосредственно в GitHub.
