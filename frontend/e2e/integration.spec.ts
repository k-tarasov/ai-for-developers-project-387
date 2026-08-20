import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  API_BASE,
  createBooking,
  dateTimeLabel,
  freeSlots,
  loginOwner,
  newGuestPage,
  newOwnerPage,
  seedEventType,
  selectSlot,
  slotTimeLabel,
  uniqueId,
  OWNER_LOGIN,
  OWNER_PASSWORD,
} from './fixtures'

test.describe('X. Кросс-поток / интеграция', () => {
  test('X1: бронь гостя появляется в списке предстоящих у владельца', async ({
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token, {
      title: `Кросс-поток ${uniqueId('x1')}`,
    })
    const guestName = `Кросс Гость ${uniqueId('x1')}`
    const { page: guestPage } = await newGuestPage(browser, {
      name: guestName,
      guestPhone: '+7 900 100-20-30',
    })
    const [slot] = await freeSlots(request, eventType.id)

    // Гость бронирует через интерфейс.
    await guestPage.goto(`/book/${eventType.id}`)
    await selectSlot(guestPage, slot)
    await guestPage.getByLabel('Комментарий (необязательно)').fill('Комментарий X1')
    await guestPage.getByRole('button', { name: /^Записаться на / }).click()
    await expect(guestPage.getByText('Вы записаны')).toBeVisible()

    // Владелец видит бронь в списке предстоящих.
    const ownerPage = await newOwnerPage(browser)
    await ownerPage.goto('/admin/bookings')
    const row = ownerPage.getByRole('row').filter({ hasText: guestName })
    await expect(row).toBeVisible()
    await expect(row).toContainText(eventType.title)
    await expect(row).toContainText(
      `${dateTimeLabel(slot.startsAt)} – ${slotTimeLabel(slot.endsAt)}`,
    )
    await expect(row).toContainText('Комментарий X1')

    await guestPage.context().close()
    await ownerPage.context().close()
  })

  test('X2: удаление типа с бронью → бронь сохраняется, новые брони невозможны (404)', async ({
    page,
    browser,
    request,
  }) => {
    const token = await loginOwner(request)
    const eventType = await seedEventType(request, token)
    const [slot] = await freeSlots(request, eventType.id)
    const guestName = `Гость X2 ${uniqueId('x2')}`
    await createBooking(request, {
      eventTypeId: eventType.id,
      startsAt: slot.startsAt,
      guestName,
      guestPhone: '+7 900 200-30-40',
    })

    // Владелец удаляет тип события через интерфейс.
    const ownerPage = await newOwnerPage(browser)
    await ownerPage.goto('/admin/event-types')
    await ownerPage
      .getByRole('row')
      .filter({ hasText: eventType.id })
      .getByRole('button', { name: 'Удалить' })
      .click()
    const dialog = ownerPage.getByRole('dialog')
    await expect(dialog.getByText('Удалить тип события?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Удалить' }).click()
    await expect(ownerPage.getByRole('row').filter({ hasText: eventType.id })).toHaveCount(0)

    // Существующая бронь сохранилась в списке предстоящих.
    await ownerPage.goto('/admin/bookings')
    await expect(ownerPage.getByRole('row').filter({ hasText: guestName })).toBeVisible()
    await ownerPage.context().close()

    // Новые брони по удалённому типу невозможны: API отвечает 404.
    const slotsResponse = await request.get(`${API_BASE}/event-types/${eventType.id}/slots`)
    expect(slotsResponse.status()).toBe(404)
    expect(((await slotsResponse.json()) as { code: string }).code).toBe('EVENT_TYPE_NOT_FOUND')

    // Гость видит «Тип события недоступен».
    await page.goto(`/book/${eventType.id}`)
    await expect(page.getByText('Тип события недоступен')).toBeVisible()
  })

  test('X3 (destructive): перезапуск бэкенда очищает in-memory данные', async () => {
    // Тест управляет собственным экземпляром бэкенда на отдельном порту,
    // чтобы не влиять на общий сервер прогона.
    test.setTimeout(180_000)
    const backendDir = path.resolve(import.meta.dirname, '..', '..', 'backend')
    const exe = path.join(os.tmpdir(), `bookingapi-e2e-${process.pid}.exe`)
    const port = 18099
    const base = `http://127.0.0.1:${port}/api`

    const waitUp = async () => {
      const deadline = Date.now() + 60_000
      for (;;) {
        try {
          const response = await fetch(`${base}/event-types`)
          if (response.ok) return
        } catch {
          // сервер ещё не поднялся
        }
        if (Date.now() > deadline) throw new Error('бэкенд не поднялся за 60 секунд')
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    const startBackend = (): ChildProcess =>
      spawn(exe, [], {
        cwd: backendDir,
        env: { ...process.env, SERVER_ADDR: `127.0.0.1:${port}` },
        stdio: 'ignore',
      })

    execFileSync('go', ['build', '-o', exe, '.'], { cwd: backendDir })

    let child = startBackend()
    try {
      await waitUp()

      // Данные, записанные в первый экземпляр.
      const loginResponse = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: OWNER_LOGIN, password: OWNER_PASSWORD }),
      })
      expect(loginResponse.status).toBe(200)
      const cookie = (loginResponse.headers.get('set-cookie') ?? '').split(';')[0]
      const createResponse = await fetch(`${base}/event-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          id: 'e2e-restart-check',
          title: 'Исчезающий тип',
          description: 'Проверка очистки in-memory хранилища',
          durationMinutes: 30,
        }),
      })
      expect(createResponse.status).toBe(201)
    } finally {
      child.kill()
    }

    // Новый экземпляр: данных предыдущего быть не должно.
    child = startBackend()
    try {
      await waitUp()
      const listResponse = await fetch(`${base}/event-types`)
      const list = (await listResponse.json()) as { id: string }[]
      expect(list.map((item) => item.id)).not.toContain('e2e-restart-check')
      // Остаются только предопределённые типы.
      expect(list.map((item) => item.id).sort()).toEqual(['15-min', '30-min'])
    } finally {
      child.kill()
      // Windows снимает блокировку exe асинхронно — ждём выхода процесса
      // и удаляем с ретраями; очистка не должна ронять тест.
      await new Promise((resolve) => child.once('exit', resolve))
      for (let i = 0; i < 10; i += 1) {
        try {
          fs.rmSync(exe, { force: true })
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
    }
  })
})
