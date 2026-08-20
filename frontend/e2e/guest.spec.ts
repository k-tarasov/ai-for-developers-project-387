import { expect, test, type Page } from '@playwright/test'

import {
  API_BASE,
  createBooking,
  dateTimeLabel,
  dayHeadingLabel,
  deleteEventType,
  emptySchedule,
  eventTypeCard,
  freeSlots,
  listSlots,
  loginOwner,
  newGuestPage,
  putSchedule,
  seedEventType,
  selectCalendarDay,
  selectSlot,
  slotTimeLabel,
  utcDayKey,
  type Slot,
  type SlotsResponse,
} from './fixtures'

/** ISO-время UTC через `dayOffset` дней от сегодня, в заданное время HH:mm. */
function isoAt(dayOffset: number, hhmm: string): string {
  const d = new Date(Date.now() + dayOffset * 86_400_000)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}T${hhmm}:00Z`
}

/**
 * Подмешивает слот в ответ `GET /event-types/{id}/slots` браузера
 * (для сценариев, которые интерфейс не может получить сам: занятый/невалидный слот).
 * `once: true` — только в первый ответ (последующие запросы идут в реальный бэкенд).
 */
async function injectSlot(page: Page, eventTypeId: string, slot: Slot, once = false) {
  let pending = true
  await page.route(`**/api/event-types/${eventTypeId}/slots`, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as SlotsResponse
    if (!once || pending) {
      pending = false
      body.slots = [...body.slots, slot].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    }
    await route.fulfill({ response, json: body })
  })
}

test.describe('G1. Главная — список типов событий', () => {
  test('G1.1: список типов событий с названием, описанием и длительностью', async ({
    page,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token, {
      title: 'Интервью e2e',
      description: 'Описание интервью e2e',
      durationMinutes: 45,
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Выберите вид встречи' })).toBeVisible()
    const card = eventTypeCard(page, eventType.title)
    await expect(card.getByText(eventType.title, { exact: true })).toBeVisible()
    await expect(card.getByText('Описание интервью e2e')).toBeVisible()
    await expect(card.getByText('45 мин')).toBeVisible()
  })

  test('G1.2: пустой список типов → понятное пустое состояние', async ({ page, request }) => {
    const token = await loginOwner(request)
    const response = await request.get(`${API_BASE}/event-types`)
    const existing = (await response.json()) as { id: string }[]
    for (const item of existing) {
      await deleteEventType(request, token, item.id)
    }

    await page.goto('/')

    await expect(page.getByText('Пока нет доступных видов записи. Загляните позже.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Выберите вид встречи' })).toBeHidden()
  })

  test('G1.3: ошибка загрузки списка → сообщение о недоступности и повтор', async ({
    page,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    await page.route('**/api/event-types', (route) => route.abort())

    await page.goto('/')

    await expect(page.getByText('Не удалось загрузить данные')).toBeVisible()
    await expect(
      page.getByText('Сервер недоступен. Проверьте подключение и попробуйте снова.'),
    ).toBeVisible()

    await page.unroute('**/api/event-types')
    await page.getByRole('button', { name: 'Повторить' }).click()

    await expect(eventTypeCard(page, eventType.title)).toBeVisible()
  })
})

test.describe('G2. Профиль гостя', () => {
  test('G2.1a: новый гость без cookie видит список типов событий', async ({ page, request }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Выберите вид встречи' })).toBeVisible()
    await expect(eventTypeCard(page, eventType.title)).toBeVisible()
    await expect(page.getByText('Вы записаны как знакомый гость.')).toBeHidden()
    await expect(page.locator('#guest-form-name')).toBeHidden()
  })

  test('G2.1b: после выбора типа новому гостю показывается форма данных', async ({
    page,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    await page.goto('/')
    await eventTypeCard(page, eventType.title).getByRole('button', { name: 'Записаться' }).click()

    await expect(page.locator('#guest-form-name')).toBeVisible()
    await expect(page.locator('#guest-form-phone')).toBeVisible()
    await expect(page.locator('#guest-form-email')).toBeVisible()
    await expect(
      page.getByText(`Заполните данные выше, чтобы записаться на «${eventType.title}».`),
    ).toBeVisible()
  })

  test('G2.2: знакомый гость видит карточку со своими данными', async ({ browser, request }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const { page } = await newGuestPage(browser, {
      name: 'Иван Знакомый',
      guestPhone: '+7 999 000-11-22',
      guestEmail: 'ivan@example.com',
      rememberMe: true,
    })

    await page.goto('/')

    await expect(page.getByText('Вы записаны как знакомый гость.')).toBeVisible()
    await expect(page.getByText('Иван Знакомый')).toBeVisible()
    await expect(page.getByText('+7 999 000-11-22')).toBeVisible()
    await expect(page.getByText('ivan@example.com')).toBeVisible()
    await expect(
      eventTypeCard(page, eventType.title).getByRole('link', { name: 'Выбрать время' }),
    ).toBeVisible()
    await page.context().close()
  })

  test('G2.3: форма с rememberMe → знакомый гость, cookie guest_id на 30 дней', async ({
    page,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    await page.goto('/')
    await eventTypeCard(page, eventType.title).getByRole('button', { name: 'Записаться' }).click()
    await page.locator('#guest-form-name').fill('Гость Запомин')
    await page.locator('#guest-form-phone').fill('+7 900 000-00-01')
    await page.getByLabel('Запомнить на 30 дней').check()
    await page.getByRole('button', { name: 'Продолжить' }).click()

    await page.waitForURL(`**/book/${eventType.id}`)
    await expect(page.getByText('Гость Запомин')).toBeVisible()

    const guestCookie = (await page.context().cookies()).find((c) => c.name === 'guest_id')
    expect(guestCookie).toBeDefined()
    // Постоянная cookie: срок жизни около 30 дней.
    expect(guestCookie!.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60)
  })

  test('G2.4: форма без rememberMe → сессионная cookie guest_id', async ({ page, request }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    await page.goto('/')
    await eventTypeCard(page, eventType.title).getByRole('button', { name: 'Записаться' }).click()
    await page.locator('#guest-form-name').fill('Гость Сессионный')
    await page.locator('#guest-form-email').fill('session@example.com')
    await page.getByRole('button', { name: 'Продолжить' }).click()

    await page.waitForURL(`**/book/${eventType.id}`)

    const guestCookie = (await page.context().cookies()).find((c) => c.name === 'guest_id')
    expect(guestCookie).toBeDefined()
    // Сессионная cookie: без срока истечения.
    expect(guestCookie!.expires).toBe(-1)
  })

  test('G2.5: форма без контакта блокирует отправку', async ({ page, request }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    await page.goto('/')
    await eventTypeCard(page, eventType.title).getByRole('button', { name: 'Записаться' }).click()
    await page.locator('#guest-form-name').fill('Без Контакта')
    await page.getByRole('button', { name: 'Продолжить' }).click()

    await expect(
      page.getByText('Укажите имя и хотя бы один контакт: телефон или email.'),
    ).toBeVisible()
    await expect(page).toHaveURL('/')
    expect((await page.context().cookies()).find((c) => c.name === 'guest_id')).toBeUndefined()
  })

  test('G2.6: знакомый гость редактирует данные в карточке', async ({ browser }) => {
    const { page } = await newGuestPage(browser, {
      name: 'Старое Имя',
      guestPhone: '+7 111 111-11-11',
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Изменить' }).click()
    await page.locator('#guest-name').fill('Новое Имя')
    await page.locator('#guest-phone').fill('+7 222 222-22-22')
    await page.getByRole('button', { name: 'Сохранить' }).click()

    await expect(page.getByText('Новое Имя')).toBeVisible()
    await expect(page.getByText('+7 222 222-22-22')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Изменить' })).toBeVisible()
    await page.context().close()
  })

  test('G2.7: ошибка PUT /guest → сообщение, данные не считаются сохранёнными', async ({
    browser,
  }) => {
    const { page } = await newGuestPage(browser, {
      name: 'Гость Ошибки',
      guestPhone: '+7 333 333-33-33',
    })
    await page.route('**/api/guest', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNKNOWN', message: 'boom' }),
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Изменить' }).click()
    await page.locator('#guest-name').fill('Не Сохранится')
    await page.getByRole('button', { name: 'Сохранить' }).click()

    await expect(page.getByText('Не удалось сохранить')).toBeVisible()
    // Форма остаётся в режиме редактирования.
    await expect(page.locator('#guest-name')).toBeVisible()

    await page.getByRole('button', { name: 'Отмена' }).click()
    await expect(page.getByText('Гость Ошибки')).toBeVisible()
    await page.context().close()
  })

  test('G2.8: профиль знакомого гостя сохраняется после перезагрузки', async ({ browser }) => {
    const { page } = await newGuestPage(browser, {
      name: 'Персистентный Гость',
      guestEmail: 'persist@example.com',
      rememberMe: true,
    })

    await page.goto('/')
    await expect(page.getByText('Персистентный Гость')).toBeVisible()

    await page.reload()

    await expect(page.getByText('Вы записаны как знакомый гость.')).toBeVisible()
    await expect(page.getByText('Персистентный Гость')).toBeVisible()
    await expect(page.getByText('persist@example.com')).toBeVisible()
    await page.context().close()
  })

  test('G2.9: ошибка загрузки профиля → сообщение о недоступности и повтор', async ({
    browser,
  }) => {
    const { page } = await newGuestPage(browser, {
      name: 'Гость Повтора',
      guestPhone: '+7 444 444-44-44',
    })
    await page.route('**/api/guest', (route) => {
      if (route.request().method() === 'GET') {
        return route.abort()
      }
      return route.continue()
    })

    await page.goto('/')

    await expect(page.getByText('Не удалось загрузить данные')).toBeVisible()
    await expect(
      page.getByText('Сервер недоступен. Проверьте подключение и попробуйте снова.'),
    ).toBeVisible()

    await page.unroute('**/api/guest')
    await page.getByRole('button', { name: 'Повторить' }).click()

    await expect(page.getByText('Гость Повтора')).toBeVisible()
    await page.context().close()
  })

  test('G2.10: ошибка создания профиля → сообщение, форма не очищается', async ({
    page,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    await page.route('**/api/guest', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'VALIDATION_ERROR', message: 'Имя уже занято' }),
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await eventTypeCard(page, eventType.title).getByRole('button', { name: 'Записаться' }).click()
    await page.locator('#guest-form-name').fill('Гость Формы')
    await page.locator('#guest-form-email').fill('form@example.com')
    await page.getByRole('button', { name: 'Продолжить' }).click()

    await expect(page.getByText('Не удалось сохранить')).toBeVisible()
    await expect(page.getByText('Имя уже занято')).toBeVisible()
    await expect(page.locator('#guest-form-name')).toHaveValue('Гость Формы')
    await expect(page).toHaveURL('/')
  })
})

test.describe('G3. Просмотр слотов', () => {
  test('G3.1: слоты загружаются и группируются по дням по возрастанию времени', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token, { durationMinutes: 30 })
    const { page } = await newGuestPage(browser, {
      name: 'Гость Слотов',
      guestPhone: '+7 555 555-55-55',
    })

    const { slots } = await listSlots(request, eventType.id)
    const byDay = new Map<string, Slot[]>()
    for (const slot of slots) {
      const key = utcDayKey(slot.startsAt)
      byDay.set(key, [...(byDay.get(key) ?? []), slot])
    }
    const days = [...byDay.entries()]
    expect(days.length).toBeGreaterThanOrEqual(2)

    await page.goto(`/book/${eventType.id}`)

    // Первый день выбран автоматически, слоты в колонке идут по возрастанию времени.
    const [firstDay, firstDaySlots] = days[0]
    await expect(
      page.getByRole('heading', { name: `${dayHeadingLabel(firstDay)} (UTC)` }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ })).toHaveText(
      firstDaySlots.map((slot) => slotTimeLabel(slot.startsAt)),
    )

    // Переключение на второй день показывает его слоты.
    const [secondDay, secondDaySlots] = days[1]
    await selectCalendarDay(page, secondDay)
    await expect(
      page.getByRole('heading', { name: `${dayHeadingLabel(secondDay)} (UTC)` }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ })).toHaveText(
      secondDaySlots.map((slot) => slotTimeLabel(slot.startsAt)),
    )
    await page.context().close()
  })

  test('G3.2: пустой список слотов → сообщение об отсутствии свободного времени', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    // Расписание по умолчанию могли изменить другие тесты — сбрасываем в пустое.
    await putSchedule(request, token, emptySchedule())
    const eventType = await seedEventType(request, token, { availability: null })
    const { page } = await newGuestPage(browser, {
      name: 'Гость Пусто',
      guestPhone: '+7 666 666-66-66',
    })

    await page.goto(`/book/${eventType.id}`)

    await expect(page.getByText('В ближайшие 14 дней свободного времени нет.')).toBeVisible()
    await page.context().close()
  })

  test('G3.3: несуществующий тип события → сообщение и возврат к списку', async ({ page }) => {
    await page.goto('/book/no-such-type-e2e')

    await expect(page.getByText('Тип события недоступен')).toBeVisible()
    await page.getByRole('link', { name: 'Вернуться к списку видов встреч' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('G4. Создание брони', () => {
  test('G4.1: знакомый гость бронирует слот → экран подтверждения', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token, { title: 'Звонок брони e2e' })
    const { page, profile } = await newGuestPage(browser, {
      name: 'Гость Брони',
      guestPhone: '+7 777 000-00-01',
    })
    const [slot] = await freeSlots(request, eventType.id)

    await page.goto(`/book/${eventType.id}`)
    await selectSlot(page, slot)
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/bookings') && req.method() === 'POST',
    )
    await page.getByRole('button', { name: /^Записаться на / }).click()
    const bookingRequest = await requestPromise

    expect(bookingRequest.postDataJSON()).toMatchObject({
      eventTypeId: eventType.id,
      startsAt: slot.startsAt,
      guestName: profile.name,
      guestPhone: profile.guestPhone,
    })
    await expect(page.getByText('Вы записаны')).toBeVisible()
    await expect(page.getByText(eventType.title)).toBeVisible()
    await expect(
      page.getByText(`${dateTimeLabel(slot.startsAt)} – ${slotTimeLabel(slot.endsAt)} UTC`),
    ).toBeVisible()
    await expect(page.getByText(`Гость: ${profile.name}`)).toBeVisible()
    await page.context().close()
  })

  test('G4.2: отправка невозможна без профиля гостя и без выбранного слота', async ({
    page,
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)

    // Гость без профиля: формы бронирования нет вовсе.
    await page.goto(`/book/${eventType.id}`)
    await expect(page.getByText('Нужны ваши данные')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Записаться на / })).toHaveCount(0)

    // Знакомый гость без выбранного слота: кнопка отправки заблокирована.
    const { page: guestPage } = await newGuestPage(browser, {
      name: 'Гость Без Слота',
      guestPhone: '+7 888 888-88-88',
    })
    await guestPage.goto(`/book/${eventType.id}`)
    const submit = guestPage.getByRole('button', { name: 'Сначала выберите время' })
    await expect(submit).toBeVisible()
    await expect(submit).toBeDisabled()
    await guestPage.context().close()
  })

  test('G4.3: слот занят (SLOT_BUSY) → сообщение и обновлённый список', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const [slot] = await freeSlots(request, eventType.id)
    // Слот занимаем через API до того, как гость откроет страницу.
    await createBooking(request, {
      eventTypeId: eventType.id,
      startsAt: slot.startsAt,
      guestName: 'Занято API',
      guestPhone: '+7 000 000-00-00',
    })
    const { page } = await newGuestPage(browser, {
      name: 'Гость Конфликт',
      guestPhone: '+7 999 999-99-99',
    })
    // Имитация устаревшего списка: подмешиваем занятый слот в первый ответ.
    await injectSlot(page, eventType.id, slot, true)

    await page.goto(`/book/${eventType.id}`)
    await selectSlot(page, slot)
    await page.getByRole('button', { name: /^Записаться на / }).click()

    await expect(page.getByText('Не удалось создать запись')).toBeVisible()
    await expect(page.getByText('Это время уже занято. Выберите другой слот.')).toBeVisible()
    // Список слотов обновился: занятое время исчезло, другие слоты доступны.
    await expect(
      page.getByRole('button', { name: slotTimeLabel(slot.startsAt), exact: true }),
    ).toBeHidden()
    await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible()
    await page.context().close()
  })

  test('G4.4a: слот не по сетке (SLOT_MISALIGNED) → текст ошибки из API', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const { page } = await newGuestPage(browser, {
      name: 'Гость Валидации',
      guestPhone: '+7 121 212-12-12',
    })
    // Слот вне 15-минутной сетки интерфейс не предлагает — подмешиваем вручную.
    const misaligned: Slot = { startsAt: isoAt(1, '10:07'), endsAt: isoAt(1, '10:37') }
    await injectSlot(page, eventType.id, misaligned)

    await page.goto(`/book/${eventType.id}`)
    await selectSlot(page, misaligned)
    await page.getByRole('button', { name: /^Записаться на / }).click()

    await expect(page.getByText('Не удалось создать запись')).toBeVisible()
    await expect(page.getByText('startsAt must be aligned to a 15-minute grid')).toBeVisible()
    // Другие слоты остаются доступными для выбора.
    await expect(page.getByRole('button', { name: '10:00', exact: true }).first()).toBeVisible()
    await page.context().close()
  })

  test('G4.4b: слот вне расписания и вне окна записи → ошибки валидации', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const { page } = await newGuestPage(browser, {
      name: 'Гость Вне Расписания',
      guestPhone: '+7 343 434-34-34',
    })
    // Слот по сетке и в окне, но вне рабочего интервала 09:00–21:00.
    const outsideSchedule: Slot = { startsAt: isoAt(1, '22:30'), endsAt: isoAt(1, '23:00') }
    await injectSlot(page, eventType.id, outsideSchedule)

    await page.goto(`/book/${eventType.id}`)
    await selectSlot(page, outsideSchedule)
    await page.getByRole('button', { name: /^Записаться на / }).click()

    await expect(page.getByText('Не удалось создать запись')).toBeVisible()
    await expect(page.getByText('startsAt does not fit owner working hours')).toBeVisible()
    await page.context().close()

    // SLOT_OUT_OF_WINDOW через интерфейс не выбрать (календарь ограничен окном) —
    // проверяем на уровне API в рамках того же e2e-прогона.
    const response = await request.post(`${API_BASE}/bookings`, {
      data: {
        eventTypeId: eventType.id,
        startsAt: isoAt(20, '10:00'),
        guestName: 'Гость Вне Окна',
        guestPhone: '+7 565 656-56-56',
      },
    })
    expect(response.status()).toBe(400)
    expect(((await response.json()) as { code: string }).code).toBe('SLOT_OUT_OF_WINDOW')
  })

  test('G4.5: комментарий гостя включается в POST /bookings', async ({ browser, request }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const { page } = await newGuestPage(browser, {
      name: 'Гость Комментария',
      guestPhone: '+7 787 878-78-78',
    })
    const [slot] = await freeSlots(request, eventType.id)

    await page.goto(`/book/${eventType.id}`)
    await selectSlot(page, slot)
    await page.getByLabel('Комментарий (необязательно)').fill('Позвоните за 5 минут')
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/bookings') && req.method() === 'POST',
    )
    await page.getByRole('button', { name: /^Записаться на / }).click()
    const bookingRequest = await requestPromise

    expect(bookingRequest.postDataJSON()).toMatchObject({
      eventTypeId: eventType.id,
      startsAt: slot.startsAt,
      guestComment: 'Позвоните за 5 минут',
    })
    await expect(page.getByText('Вы записаны')).toBeVisible()
    await page.context().close()
  })
})
