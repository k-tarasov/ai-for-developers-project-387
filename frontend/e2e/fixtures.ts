import type { APIRequestContext, APIResponse, Browser, Page } from '@playwright/test'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

import type { components } from '../src/api/schema'

export type EventType = components['schemas']['EventType']
export type WeeklySchedule = components['schemas']['WeeklySchedule']
export type Slot = components['schemas']['Slot']
export type Booking = components['schemas']['Booking']
export type GuestProfile = components['schemas']['GuestProfile']
export type SlotsResponse = components['schemas']['SlotsResponse']

/** Прямой доступ к API бэкенда (минуя vite-прокси). */
export const API_BASE = 'http://localhost:8080/api'
/** Origin фронтенда e2e-окружения (совпадает с baseURL в playwright.config.ts). */
export const BASE_URL = 'http://localhost:4173'
export const OWNER_LOGIN = 'admin'
export const OWNER_PASSWORD = 'admin'

let uniqueCounter = 0

/** Уникальный идентификатор в рамках прогона, чтобы данные тестов не пересекались. */
export function uniqueId(prefix: string): string {
  uniqueCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${uniqueCounter}`
}

async function extractCookie(response: APIResponse, name: string): Promise<string> {
  const setCookie = response.headers()['set-cookie'] ?? ''
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookie)
  if (!match) {
    throw new Error(`В ответе нет cookie ${name}: ${setCookie}`)
  }
  return match[1]
}

/** Логин владельца через API. Возвращает токен cookie `owner_session`. */
export async function loginOwner(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { login: OWNER_LOGIN, password: OWNER_PASSWORD },
  })
  if (!response.ok()) {
    throw new Error(`Логин владельца не удался: ${response.status()} ${await response.text()}`)
  }
  return extractCookie(response, 'owner_session')
}

function ownerAuth(token: string): Record<string, string> {
  return { Cookie: `owner_session=${token}` }
}

/** Расписание из одного интервала на каждый день недели. */
export function dailyAvailability(start = '09:00', end = '21:00'): WeeklySchedule {
  const interval = [{ start, end }]
  return {
    mon: interval,
    tue: interval,
    wed: interval,
    thu: interval,
    fri: interval,
    sat: interval,
    sun: interval,
  }
}

/** Пустое расписание (ни одного рабочего интервала). */
export function emptySchedule(): WeeklySchedule {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

export interface SeedEventTypeOptions {
  id?: string
  title?: string
  description?: string
  durationMinutes?: number
  /**
   * Собственное расписание типа события. По умолчанию — 09:00–21:00 каждый день.
   * `null` — без собственного расписания (используется расписание владельца).
   */
  availability?: WeeklySchedule | null
}

/** Создаёт тип события через API от имени владельца. */
export async function seedEventType(
  request: APIRequestContext,
  ownerToken: string,
  options: SeedEventTypeOptions = {},
): Promise<EventType> {
  const id = options.id ?? uniqueId('e2e-et')
  const body: Record<string, unknown> = {
    id,
    title: options.title ?? `Встреча ${id}`,
    description: options.description ?? 'Создано e2e-тестом.',
    durationMinutes: options.durationMinutes ?? 30,
  }
  const availability =
    options.availability === undefined ? dailyAvailability() : options.availability
  if (availability !== null) {
    body.availability = availability
  }
  const response = await request.post(`${API_BASE}/event-types`, {
    data: body,
    headers: ownerAuth(ownerToken),
  })
  if (!response.ok()) {
    throw new Error(`Не удалось создать тип события: ${response.status()} ${await response.text()}`)
  }
  return (await response.json()) as EventType
}

export async function deleteEventType(
  request: APIRequestContext,
  ownerToken: string,
  eventTypeId: string,
): Promise<void> {
  const response = await request.delete(`${API_BASE}/event-types/${eventTypeId}`, {
    headers: ownerAuth(ownerToken),
  })
  if (!response.ok()) {
    throw new Error(`Не удалось удалить тип события: ${response.status()} ${await response.text()}`)
  }
}

export async function putSchedule(
  request: APIRequestContext,
  ownerToken: string,
  schedule: WeeklySchedule,
): Promise<void> {
  const response = await request.put(`${API_BASE}/schedule`, {
    data: schedule,
    headers: ownerAuth(ownerToken),
  })
  if (!response.ok()) {
    throw new Error(
      `Не удалось сохранить расписание: ${response.status()} ${await response.text()}`,
    )
  }
}

export async function listSlots(
  request: APIRequestContext,
  eventTypeId: string,
): Promise<SlotsResponse> {
  const response = await request.get(`${API_BASE}/event-types/${eventTypeId}/slots`)
  if (!response.ok()) {
    throw new Error(`Не удалось получить слоты: ${response.status()} ${await response.text()}`)
  }
  return (await response.json()) as SlotsResponse
}

/** Первые `count` свободных слотов в будущем (с запасом 5 минут от текущего момента). */
export async function freeSlots(
  request: APIRequestContext,
  eventTypeId: string,
  count = 1,
): Promise<Slot[]> {
  const { slots } = await listSlots(request, eventTypeId)
  const threshold = Date.now() + 5 * 60_000
  const future = slots.filter((slot) => Date.parse(slot.startsAt) > threshold)
  if (future.length < count) {
    throw new Error(`Для ${eventTypeId} найдено ${future.length} свободных слотов вместо ${count}`)
  }
  return future.slice(0, count)
}

export interface BookingInput {
  eventTypeId: string
  startsAt: string
  guestName: string
  guestPhone?: string
  guestEmail?: string
  guestComment?: string
}

export async function createBooking(
  request: APIRequestContext,
  body: BookingInput,
): Promise<Booking> {
  const response = await request.post(`${API_BASE}/bookings`, { data: body })
  if (!response.ok()) {
    throw new Error(`Не удалось создать бронь: ${response.status()} ${await response.text()}`)
  }
  return (await response.json()) as Booking
}

export interface GuestInput {
  name: string
  guestPhone?: string
  guestEmail?: string
  rememberMe?: boolean
}

/** Создаёт гостя через API. Возвращает профиль и значение cookie `guest_id`. */
export async function createGuest(
  request: APIRequestContext,
  input: GuestInput,
): Promise<{ profile: GuestProfile; cookie: string }> {
  const response = await request.post(`${API_BASE}/guest`, {
    data: { rememberMe: false, ...input },
  })
  if (!response.ok()) {
    throw new Error(`Не удалось создать гостя: ${response.status()} ${await response.text()}`)
  }
  const cookie = await extractCookie(response, 'guest_id')
  return { profile: (await response.json()) as GuestProfile, cookie }
}

/** Страница браузера с активной сессией владельца (cookie + localStorage-флаг интерфейса). */
export async function newOwnerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, timezoneId: 'UTC' })
  const token = await loginOwner(context.request)
  await context.addCookies([{ name: 'owner_session', value: token, url: BASE_URL, httpOnly: true }])
  await context.addInitScript(() => {
    window.localStorage.setItem('owner_session_active', 'true')
  })
  return context.newPage()
}

/** Страница браузера знакомого гостя (cookie `guest_id`). */
export async function newGuestPage(
  browser: Browser,
  input: GuestInput,
): Promise<{ page: Page; profile: GuestProfile }> {
  const context = await browser.newContext({ baseURL: BASE_URL, timezoneId: 'UTC' })
  const { profile, cookie } = await createGuest(context.request, input)
  await context.addCookies([{ name: 'guest_id', value: cookie, url: BASE_URL, httpOnly: true }])
  const page = await context.newPage()
  return { page, profile }
}

/** Подпись времени слота, как в интерфейсе (UTC, HH:mm). */
export function slotTimeLabel(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Ключ дня YYYY-MM-DD в UTC. */
export function utcDayKey(iso: string): string {
  const d = new Date(iso)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Подпись дня в заголовке списка слотов («вт, 19 августа»). */
export function dayHeadingLabel(dayKey: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dayKey}T00:00:00Z`))
}

/** Подпись даты-времени, как в интерфейсе («19 августа, 10:00»). */
export function dateTimeLabel(iso: string): string {
  return `${dayHeadingLabel(utcDayKey(iso))}, ${slotTimeLabel(iso)}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Выбирает день в календаре react-day-picker (при необходимости листает месяцы вперёд). */
export async function selectCalendarDay(page: Page, dayKey: string): Promise<void> {
  const [year, month, day] = dayKey.split('-').map(Number)
  const label = format(new Date(Date.UTC(year, month - 1, day)), 'PPPP', { locale: ru })
  const dayButton = page.getByRole('button', { name: new RegExp(escapeRegExp(label)) })
  await page.getByRole('grid').first().waitFor()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await dayButton.count()) > 0) {
      await dayButton.first().click()
      return
    }
    await page.getByRole('button', { name: 'Перейти к следующему месяцу' }).click()
  }
  throw new Error(`День ${dayKey} не найден в календаре`)
}

/** Выбирает слот на странице записи: день в календаре, затем кнопку времени. */
export async function selectSlot(page: Page, slot: Slot): Promise<void> {
  await selectCalendarDay(page, utcDayKey(slot.startsAt))
  await page.getByRole('button', { name: slotTimeLabel(slot.startsAt), exact: true }).click()
}

/** Карточка типа события на главной странице по названию. */
export function eventTypeCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: title })
}
