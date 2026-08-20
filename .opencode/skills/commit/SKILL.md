---
name: commit
description: Создание git-коммитов с сообщениями в Angular conventional commits стиле (feat, fix, docs и т.д.). Использовать, когда пользователь просит сделать коммит, закоммитить изменения или написать сообщение коммита.
---

# Коммиты в Angular стиле (Conventional Commits)

## Формат сообщения

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
```

## Правила

1. **type** — обязательный, из фиксированного списка:

   | type      | когда использовать                                          |
   |-----------|------------------------------------------------------------|
   | `feat`    | новая функциональность                                     |
   | `fix`     | исправление бага                                           |
   | `docs`    | только документация (README, комментарии в md)             |
   | `style`   | форматирование, пробелы, точка с запятой — без логики      |
   | `refactor` | изменение кода без fix и feat                              |
   | `perf`    | улучшение производительности                                |
   | `test`    | добавление/правка тестов                                   |
   | `build`   | сборка, зависимости (go.mod, package.json, Makefile)       |
   | `ci`      | конфигурация CI                                            |
   | `chore`   | прочая рутинная работа, не относящаяся к src/тестам        |
   | `revert`  | откат предыдущего коммита                                  |

2. **scope** — необязательный контекст. Для этого монорепо используй `frontend` или `backend`, например: `feat(backend): ...`. Не смешивай frontend и backend в одном коммите без необходимости.

3. **subject**:
   - повелительное наклонение («add», не «added»/«adds»)
   - со строчной буквы, без точки в конце
   - не длиннее 72 символов
   - без упоминания типа внутри («fix: исправляет баг» — плохо)

4. **body** (необязательно): что и почему изменилось, а не как. Отделяй пустой строкой.

5. **footer** (необязательно):
   - `BREAKING CHANGE: <описание>` при ломающих изменениях (или `!` после type/scope: `feat(api)!: ...`)
   - ссылки на issues: `Closes #123`

## Порядок работы

1. `git status` и `git diff` (плюс `git diff --staged`, `git log --oneline -10`) — понять, что изменилось и в каком стиле история.
2. Определи type и scope по сути изменений. Один коммит — одна логическая правка; при несвязанных правках предложи разбить на несколько коммитов.
3. Сделай staging только нужных файлов (`git add <files>`), никогда не коммить секреты.
4. Коммить: `git commit -m "<type>(<scope>): <subject>"` (с body через несколько `-m`, если нужен).
5. Никогда не используй `--amend`, `--no-verify`, force-push и пустые коммиты, если пользователь явно не попросил. Если хук отклонил коммит — исправь проблему и сделай новый коммит.

## Примеры

```
feat(frontend): add user registration form
fix(backend): handle nil pointer in token refresh
docs: update setup instructions in README
refactor(backend): extract auth middleware into separate package
test(frontend): add validation tests for login form
build: pin go version to 1.22 in Makefile
feat(api)!: change response format of /users endpoint

BREAKING CHANGE: /users now returns a list instead of a single object
```
