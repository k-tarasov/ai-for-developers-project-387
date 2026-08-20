import { expect, test, type Page } from '@playwright/test'

import {
  API_BASE,
  createBooking,
  dateTimeLabel,
  emptySchedule,
  listSlots,
  loginOwner,
  newOwnerPage,
  putSchedule,
  seedEventType,
  slotTimeLabel,
  uniqueId,
  OWNER_LOGIN,
  OWNER_PASSWORD,
} from './fixtures'

/** Вход владельца через диалог в интерфейсе. */
async function loginViaDialog(page: Page, login: string, password: string) {
  await page.getByRole('button', { name: 'Админка' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Вход для владельца')).toBeVisible()
  await page.locator('#owner-login').fill(login)
  await page.locator('#owner-password').fill(password)
  await dialog.getByRole('button', { name: 'Войти' }).click()
}

/** Строка редактора расписания по названию дня недели. */
function dayRow(page: Page, dayLabel: string) {
  return page.getByText(dayLabel, { exact: true }).locator('..')
}

test.describe('O1. Аутентификация владельца', () => {
  test('O1.1: успешный вход → cookie owner_session и интерфейс владельца', async ({ page }) => {
    await page.goto('/')
    await loginViaDialog(page, OWNER_LOGIN, OWNER_PASSWORD)

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Владелец', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Типы событий' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Расписание' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Брони' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()

    const cookie = (await page.context().cookies()).find((c) => c.name === 'owner_session')
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
  })

  test('O1.2: неверные учётные данные → сообщение, интерфейс не открыт', async ({ page }) => {
    await page.goto('/')
    await loginViaDialog(page, OWNER_LOGIN, 'wrong-password')

    await expect(page.getByText('Не удалось войти')).toBeVisible()
    await expect(page.getByText('Неверный логин или пароль.')).toBeVisible()
    await expect(page.getByText('Владелец', { exact: true })).toBeHidden()
  })

  test('O1.3: превышен лимит попыток → сообщение о временной блокировке', async ({
    page,
    request,
  }) => {
    // Сбрасываем счётчик успешным входом и исчерпываем лимит через API (4 из 5).
    await loginOwner(request)
    for (let i = 0; i < 4; i += 1) {
      const res = await request.post(`${API_BASE}/auth/login`, {
        data: { login: OWNER_LOGIN, password: 'wrong-password' },
      })
      expect(res.status()).toBe(401)
    }

    await page.goto('/')
    await loginViaDialog(page, OWNER_LOGIN, 'wrong-password')

    await expect(page.getByText('Не удалось войти')).toBeVisible()
    await expect(page.getByText('Слишком много попыток входа. Попробуйте позже.')).toBeVisible()

    // Сброс счётчика, чтобы не блокировать вход в других тестах.
    await loginOwner(request)
  })

  test('O1.4: владелец с действующей сессией после перезагрузки остаётся в интерфейсе', async ({
    page,
  }) => {
    await page.goto('/')
    await loginViaDialog(page, OWNER_LOGIN, OWNER_PASSWORD)
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()

    await page.reload()

    // Повторный вход не требуется: элементы управления владельца на месте.
    await expect(page.getByText('Владелец', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Типы событий' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
  })
})

test.describe('O2. Шапка / навигация', () => {
  test('O2.1: гость без сессии видит ровно две кнопки', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Записаться' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Админка' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Типы событий' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Расписание' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Брони' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeHidden()
  })

  test('O2.2: после входа показываются все элементы управления владельца', async ({ page }) => {
    await page.goto('/')
    await loginViaDialog(page, OWNER_LOGIN, OWNER_PASSWORD)

    await expect(page.getByRole('link', { name: 'Записаться' })).toBeVisible()
    await expect(page.getByText('Владелец', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Типы событий' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Расписание' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Брони' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
  })
})

test.describe('O3. Управление типами событий', () => {
  test('O3.1: создание типа события через форму → тип появляется в списке', async ({ browser }) => {
    const page = await newOwnerPage(browser)
    const id = uniqueId('e2e-owner')

    await page.goto('/admin/event-types')
    await page.getByRole('button', { name: 'Создать' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Новый тип события')).toBeVisible()
    await dialog.getByLabel('Идентификатор (slug)').fill(id)
    await dialog.getByLabel('Название').fill('Новый тип e2e')
    await dialog.getByLabel('Описание').fill('Описание нового типа e2e')
    await dialog.getByLabel('Длительность, минут').fill('45')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: id })
    await expect(row.getByText('Новый тип e2e')).toBeVisible()
    await expect(row.getByText('45 мин')).toBeVisible()
    await page.context().close()
  })

  test('O3.2: дубликат slug → сообщение, форма не очищается', async ({ browser, request }) => {
    const token = await loginOwner(request)
    const existing = await seedEventType(request, token)
    const page = await newOwnerPage(browser)

    await page.goto('/admin/event-types')
    await page.getByRole('button', { name: 'Создать' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Идентификатор (slug)').fill(existing.id)
    await dialog.getByLabel('Название').fill('Дубликат e2e')
    await dialog.getByLabel('Описание').fill('Попытка создать дубликат')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    await expect(dialog.getByText('Не удалось сохранить')).toBeVisible()
    await expect(
      dialog.getByText('Тип события с таким идентификатором уже существует.'),
    ).toBeVisible()
    // Форма не очищается.
    await expect(dialog.getByLabel('Идентификатор (slug)')).toHaveValue(existing.id)
    await expect(dialog.getByLabel('Название')).toHaveValue('Дубликат e2e')
    await page.context().close()
  })

  test('O3.3: удаление типа события с подтверждением → тип исчезает из списка', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const page = await newOwnerPage(browser)

    await page.goto('/admin/event-types')
    const row = page.getByRole('row').filter({ hasText: eventType.id })
    await row.getByRole('button', { name: 'Удалить' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Удалить тип события?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Удалить' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: eventType.id })).toHaveCount(0)
    await page.context().close()
  })

  test('O3.4: ошибка валидации формы → текст ошибки рядом с полем', async ({ browser }) => {
    const page = await newOwnerPage(browser)

    await page.goto('/admin/event-types')
    await page.getByRole('button', { name: 'Создать' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Идентификатор (slug)').fill('BAD SLUG')
    await dialog.getByLabel('Название').fill('Невалидный тип')
    // Описание оставляем пустым — ошибка валидации.
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    await expect(
      dialog.getByText('Строчные буквы, цифры и дефисы, например intro-call'),
    ).toBeVisible()
    await expect(dialog.getByText('Укажите описание')).toBeVisible()
    // Диалог остаётся открытым, запрос не отправляется.
    await expect(dialog.getByText('Новый тип события')).toBeVisible()
    await page.context().close()
  })

  test('O3.5: создание типа без сессии владельца → 401, диалог входа', async ({
    page,
    request,
  }) => {
    const id = uniqueId('e2e-nosession')
    await page.goto('/admin/event-types')
    // Список публичный и загружается, но мутации недоступны.
    await page.getByRole('button', { name: 'Создать' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Идентификатор (slug)').fill(id)
    await dialog.getByLabel('Название').fill('Без сессии')
    await dialog.getByLabel('Описание').fill('Попытка без сессии')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    // 401 → интерфейс требует входа: открывается диалог логина.
    await expect(page.getByText('Вход для владельца')).toBeVisible()
    // Тип не создан.
    const listResponse = await request.get(`${API_BASE}/event-types`)
    const list = (await listResponse.json()) as { id: string }[]
    expect(list.map((item) => item.id)).not.toContain(id)
  })

  test('O3.6: редактирование типа события → изменения в списке, slug недоступен', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token, { title: 'До правки' })
    const page = await newOwnerPage(browser)

    await page.goto('/admin/event-types')
    const row = page.getByRole('row').filter({ hasText: eventType.id })
    await row.getByRole('button', { name: 'Редактировать' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Редактировать тип события')).toBeVisible()
    await expect(dialog.getByLabel('Идентификатор (slug)')).toBeDisabled()
    await dialog.getByLabel('Название').fill('После правки')
    await dialog.getByLabel('Длительность, минут').fill('60')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    await expect(dialog).toBeHidden()
    const updatedRow = page.getByRole('row').filter({ hasText: eventType.id })
    await expect(updatedRow.getByText('После правки')).toBeVisible()
    await expect(updatedRow.getByText('60 мин')).toBeVisible()
    await page.context().close()
  })

  test('O3.7: собственное расписание типа → бейдж «Собственное», слоты по нему', async ({
    browser,
    request,
  }) => {
    const page = await newOwnerPage(browser)
    const id = uniqueId('e2e-own-av')

    await page.goto('/admin/event-types')
    await page.getByRole('button', { name: 'Создать' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Идентификатор (slug)').fill(id)
    await dialog.getByLabel('Название').fill('Со своим расписанием')
    await dialog.getByLabel('Описание').fill('Тип с собственной доступностью')
    await dialog.getByLabel('Собственное расписание доступности').check()

    // Собственное расписание: только вторник 10:00–12:00.
    const tuesday = dayRow(dialog, 'Вторник')
    await tuesday.getByRole('button', { name: 'Интервал' }).click()
    await tuesday.locator('input[type="time"]').nth(0).fill('10:00')
    await tuesday.locator('input[type="time"]').nth(1).fill('12:00')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: id })
    await expect(row.getByText('Собственное')).toBeVisible()

    // Слоты считаются по собственному расписанию: только вторники, 10:00–11:30 UTC.
    const { slots } = await listSlots(request, id)
    expect(slots.length).toBeGreaterThan(0)
    for (const slot of slots) {
      expect(new Date(slot.startsAt).getUTCDay()).toBe(2)
      const label = slotTimeLabel(slot.startsAt)
      expect(label >= '10:00' && label <= '11:30').toBe(true)
    }
    await page.context().close()
  })
})

test.describe('O4. Расписание по умолчанию', () => {
  test('O4.1: страница расписания показывает текущее недельное расписание по дням', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    await putSchedule(request, token, {
      ...emptySchedule(),
      mon: [{ start: '09:00', end: '13:30' }],
    })
    const page = await newOwnerPage(browser)

    await page.goto('/admin/schedule')

    await expect(page.getByRole('heading', { name: 'Расписание по умолчанию (UTC)' })).toBeVisible()
    for (const label of [
      'Понедельник',
      'Вторник',
      'Среда',
      'Четверг',
      'Пятница',
      'Суббота',
      'Воскресенье',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
    const monday = dayRow(page, 'Понедельник')
    await expect(monday.locator('input[type="time"]').nth(0)).toHaveValue('09:00')
    await expect(monday.locator('input[type="time"]').nth(1)).toHaveValue('13:30')
    // У дня без интервалов — пометка «Недоступно».
    await expect(dayRow(page, 'Среда').getByText('Недоступно')).toBeVisible()
    await page.context().close()
  })

  test('O4.2: редактирование и сохранение расписания → показывается сохранённая версия', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    await putSchedule(request, token, emptySchedule())
    const page = await newOwnerPage(browser)

    await page.goto('/admin/schedule')
    const tuesday = dayRow(page, 'Вторник')
    await tuesday.getByRole('button', { name: 'Интервал' }).click()
    await tuesday.locator('input[type="time"]').nth(0).fill('10:00')
    await tuesday.locator('input[type="time"]').nth(1).fill('12:00')
    await page.getByRole('button', { name: 'Сохранить расписание' }).click()

    await expect(page.getByText('Расписание сохранено')).toBeVisible()

    await page.reload()
    const tuesdayAfter = dayRow(page, 'Вторник')
    await expect(tuesdayAfter.locator('input[type="time"]').nth(0)).toHaveValue('10:00')
    await expect(tuesdayAfter.locator('input[type="time"]').nth(1)).toHaveValue('12:00')
    await page.context().close()
  })

  test('O4.3: ошибка валидации при сохранении → текст ошибки, расписание не сохранено', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    await putSchedule(request, token, emptySchedule())
    const page = await newOwnerPage(browser)

    await page.goto('/admin/schedule')
    const wednesday = dayRow(page, 'Среда')
    await wednesday.getByRole('button', { name: 'Интервал' }).click()
    // Конец раньше начала — бэкенд отвечает 400 VALIDATION_ERROR.
    await wednesday.locator('input[type="time"]').nth(0).fill('13:00')
    await wednesday.locator('input[type="time"]').nth(1).fill('09:00')
    await page.getByRole('button', { name: 'Сохранить расписание' }).click()

    await expect(page.getByText('Не удалось сохранить расписание')).toBeVisible()
    await expect(page.getByText('invalid schedule intervals')).toBeVisible()
    await expect(page.getByText('Расписание сохранено')).toBeHidden()
    await page.context().close()
  })

  test('O4.4: страница расписания без сессии владельца → интерфейс недоступен', async ({
    page,
  }) => {
    await page.goto('/admin/schedule')

    await expect(
      page.getByText('Сессия владельца не найдена. Войдите в админку заново.'),
    ).toBeVisible()
    await expect(page.getByText('Вход для владельца')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сохранить расписание' })).toHaveCount(0)
  })
})

test.describe('O5. Предстоящие брони', () => {
  test('O5.1: список предстоящих броней по возрастанию времени с гостем и типом', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    // Два НЕпересекающихся слота (сетка 15 минут даёт соседние слоты с перекрытием).
    const { slots } = await listSlots(request, eventType.id)
    const threshold = Date.now() + 5 * 60_000
    const future = slots.filter((slot) => Date.parse(slot.startsAt) > threshold)
    const first = future[0]
    const second = future.find((slot) => Date.parse(slot.startsAt) >= Date.parse(first.endsAt))
    expect(second).toBeDefined()
    const suffix = uniqueId('o5')
    // Создаём в обратном порядке: поздний слот первым.
    await createBooking(request, {
      eventTypeId: eventType.id,
      startsAt: second.startsAt,
      guestName: `Порядок Б ${suffix}`,
      guestPhone: '+7 900 000-00-02',
      guestComment: 'Вторая по времени',
    })
    await createBooking(request, {
      eventTypeId: eventType.id,
      startsAt: first.startsAt,
      guestName: `Порядок А ${suffix}`,
      guestEmail: 'pervyy@example.com',
    })
    const page = await newOwnerPage(browser)

    await page.goto('/admin/bookings')

    const rowA = page.getByRole('row').filter({ hasText: `Порядок А ${suffix}` })
    const rowB = page.getByRole('row').filter({ hasText: `Порядок Б ${suffix}` })
    await expect(rowA).toBeVisible()
    await expect(rowB).toBeVisible()
    await expect(rowA).toContainText(eventType.title)
    await expect(rowA).toContainText(
      `${dateTimeLabel(first.startsAt)} – ${slotTimeLabel(first.endsAt)}`,
    )
    await expect(rowA).toContainText('pervyy@example.com')
    await expect(rowB).toContainText('Вторая по времени')

    // Сортировка по возрастанию времени: А раньше Б.
    const rows = await page.getByRole('row').allTextContents()
    const indexA = rows.findIndex((text) => text.includes(`Порядок А ${suffix}`))
    const indexB = rows.findIndex((text) => text.includes(`Порядок Б ${suffix}`))
    expect(indexA).toBeGreaterThanOrEqual(0)
    expect(indexB).toBeGreaterThan(indexA)
    await page.context().close()
  })

  test('O5.2: пустой список броней → понятное пустое состояние', async ({ browser }) => {
    const page = await newOwnerPage(browser)
    // Брони других тестов уже лежат в общем in-memory хранилище,
    // поэтому пустой ответ эмулируем перехватом.
    await page.route('**/api/bookings', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [] })
      }
      return route.continue()
    })

    await page.goto('/admin/bookings')

    await expect(page.getByText('Предстоящие брони')).toBeVisible()
    await expect(page.getByText('Предстоящих броней нет.')).toBeVisible()
    await page.context().close()
  })

  test('O5.3: страница броней без сессии владельца → интерфейс недоступен', async ({ page }) => {
    await page.goto('/admin/bookings')

    await expect(
      page.getByText('Сессия владельца не найдена. Войдите в админку заново.'),
    ).toBeVisible()
    await expect(page.getByText('Вход для владельца')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})
