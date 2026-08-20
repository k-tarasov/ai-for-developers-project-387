import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from './errors'
import type { components } from './schema'

export type EventType = components['schemas']['EventType']
export type WeeklySchedule = components['schemas']['WeeklySchedule']
export type TimeInterval = components['schemas']['TimeInterval']
export type Slot = components['schemas']['Slot']
export type Booking = components['schemas']['Booking']
export type BookingCreate = components['schemas']['BookingCreate']
export type OwnerLogin = components['schemas']['OwnerLogin']
export type GuestProfile = components['schemas']['GuestProfile']
export type GuestCreate = components['schemas']['GuestCreate']

export const queryKeys = {
  eventTypes: ['event-types'] as const,
  eventType: (id: string) => ['event-types', id] as const,
  slots: (eventTypeId: string) => ['slots', eventTypeId] as const,
  schedule: ['schedule'] as const,
  bookings: ['bookings'] as const,
  guest: ['guest'] as const,
}

const delay = <T>(value: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

const iso = (d: Date): string => d.toISOString()

function addMinutes(d: Date, minutes: number): Date {
  const next = new Date(d)
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

function genToken(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'tok-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

// ---------------------------------------------------------------------------
// Мок «бэкенда»: аутентификация владельца
// ---------------------------------------------------------------------------

const OWNER_LOGIN = import.meta.env.VITE_OWNER_LOGIN ?? 'owner'
const OWNER_PASSWORD = import.meta.env.VITE_OWNER_PASSWORD ?? 'owner'
const MAX_LOGIN_ATTEMPTS = 5
const OWNER_SESSION_KEY = 'mock_owner_session'

function loadOwnerSession(): string | null {
  try {
    return localStorage.getItem(OWNER_SESSION_KEY)
  } catch {
    return null
  }
}

function saveOwnerSession(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(OWNER_SESSION_KEY, token)
    } else {
      localStorage.removeItem(OWNER_SESSION_KEY)
    }
  } catch {
    // игнорируем недоступность хранилища
  }
}

let ownerSessionToken: string | null = loadOwnerSession()
let failedLoginAttempts = 0

/** Сравнение строк за (приблизительно) постоянное время — без раннего выхода. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// ---------------------------------------------------------------------------
// Мок «бэкенда»: профиль гостя
// ---------------------------------------------------------------------------

const GUEST_PROFILE_KEY = 'mock_guest_profile'

const guests = new Map<string, GuestProfile>()
let currentGuestId: string | null = null

try {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY)
  if (raw) {
    const guest = JSON.parse(raw) as GuestProfile
    if (guest?.id) {
      guests.set(guest.id, guest)
      currentGuestId = guest.id
    }
  }
} catch {
  // игнорируем недоступность хранилища
}

function persistGuest(guest: GuestProfile | null): void {
  try {
    if (guest) {
      localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(guest))
    } else {
      localStorage.removeItem(GUEST_PROFILE_KEY)
    }
  } catch {
    // игнорируем недоступность хранилища
  }
}

function requireOwner(): void {
  if (!ownerSessionToken) {
    throw new ApiError(401, 'NO_OWNER_SESSION', 'Требуется сессия владельца.')
  }
}

// ---------------------------------------------------------------------------
// Данные типов событий, расписания и броней
// ---------------------------------------------------------------------------

const MOCK_EVENT_TYPES: EventType[] = [
  {
    id: 'intro-call',
    title: 'Знакомственный звонок',
    description: 'Короткая встреча, чтобы обсудить сотрудничество и познакомиться.',
    durationMinutes: 30,
  },
  {
    id: 'strategy-session',
    title: 'Стратегическая сессия',
    description: 'Глубокий разбор задач и плана работ на ближайший месяц.',
    durationMinutes: 60,
  },
  {
    id: 'tech-review',
    title: 'Технический ревью',
    description: 'Разбор архитектуры и кода вашего проекта.',
    durationMinutes: 45,
    availability: {
      mon: [{ start: '10:00', end: '14:00' }],
      tue: [],
      wed: [{ start: '09:00', end: '12:00' }],
      thu: [{ start: '09:00', end: '12:00' }],
      fri: [],
      sat: [],
      sun: [],
    },
  },
]

const MOCK_SCHEDULE: WeeklySchedule = {
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [{ start: '09:00', end: '17:00' }],
  wed: [{ start: '09:00', end: '17:00' }],
  thu: [{ start: '09:00', end: '17:00' }],
  fri: [{ start: '09:00', end: '15:00' }],
  sat: [],
  sun: [],
}

const MOCK_BOOKINGS: Booking[] = (() => {
  const now = new Date()
  const base = new Date(now)
  base.setDate(base.getDate() + 1)
  base.setHours(10, 0, 0, 0)
  const et = MOCK_EVENT_TYPES[0]
  return [
    {
      id: '00000000-0000-0000-0000-000000000001',
      eventType: { id: et.id, title: et.title, durationMinutes: et.durationMinutes },
      startsAt: iso(base),
      endsAt: iso(addMinutes(base, et.durationMinutes)),
      guestName: 'Иван Иванов',
      guestEmail: 'ivan@example.com',
      guestComment: 'Хочу узнать подробности.',
      createdAt: iso(addMinutes(now, -30)),
    },
  ]
})()

function buildSlots(eventTypeId: string): components['schemas']['SlotsResponse'] {
  const et = MOCK_EVENT_TYPES.find((e) => e.id === eventTypeId)
  const duration = et?.durationMinutes ?? 30
  const now = new Date()
  const windowStartsOn = new Date(now)
  windowStartsOn.setHours(0, 0, 0, 0)
  const windowEndsOn = addMinutes(windowStartsOn, 14 * 24 * 60)

  const slots: Slot[] = []
  for (let day = 0; day < 14; day++) {
    const start = new Date(windowStartsOn)
    start.setDate(start.getDate() + day)
    start.setHours(9, 0, 0, 0)
    const endOfDay = new Date(start)
    endOfDay.setHours(17, 0, 0, 0)
    while (addMinutes(start, duration) <= endOfDay) {
      slots.push({ startsAt: iso(start), endsAt: iso(addMinutes(start, duration)) })
      start.setMinutes(start.getMinutes() + 30)
    }
  }

  return {
    windowStartsOn: windowStartsOn.toISOString().slice(0, 10),
    windowEndsOn: windowEndsOn.toISOString().slice(0, 10),
    slots,
  }
}

// ---------------------------------------------------------------------------
// Владелец: аутентификация
// ---------------------------------------------------------------------------

export function useLoginOwner() {
  return useMutation({
    mutationFn: (body: OwnerLogin) => {
      if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        return Promise.reject(
          new ApiError(429, 'LOGIN_ATTEMPTS_EXCEEDED', 'Слишком много попыток входа. Попробуйте позже.'),
        )
      }
      const okLogin = constantTimeEquals(body.login, OWNER_LOGIN)
      const okPassword = constantTimeEquals(body.password, OWNER_PASSWORD)
      if (!okLogin || !okPassword) {
        failedLoginAttempts += 1
        return Promise.reject(
          new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль.'),
        )
      }
      failedLoginAttempts = 0
      ownerSessionToken = genToken()
      saveOwnerSession(ownerSessionToken)
      return delay({ ok: true as const })
    },
  })
}

// ---------------------------------------------------------------------------
// Владелец: данные (требуют сессии)
// ---------------------------------------------------------------------------

export function useEventTypes() {
  return useQuery({
    queryKey: queryKeys.eventTypes,
    queryFn: () => delay(MOCK_EVENT_TYPES),
  })
}

export function useEventType(eventTypeId: string) {
  return useQuery({
    queryKey: queryKeys.eventType(eventTypeId),
    queryFn: () => {
      const found = MOCK_EVENT_TYPES.find((e) => e.id === eventTypeId)
      if (!found) {
        return Promise.reject(new ApiError(404, 'EVENT_TYPE_NOT_FOUND', `EVENT_TYPE_NOT_FOUND: ${eventTypeId}`))
      }
      return delay(found)
    },
  })
}

export function useSlots(eventTypeId: string) {
  return useQuery({
    queryKey: queryKeys.slots(eventTypeId),
    queryFn: () => delay(buildSlots(eventTypeId)),
  })
}

export function useSchedule() {
  return useQuery({
    queryKey: queryKeys.schedule,
    queryFn: () => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      return delay(MOCK_SCHEDULE)
    },
  })
}

export function useBookings() {
  return useQuery({
    queryKey: queryKeys.bookings,
    queryFn: () => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      return delay(MOCK_BOOKINGS)
    },
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BookingCreate) => {
      const et = MOCK_EVENT_TYPES.find((e) => e.id === body.eventTypeId)
      const booking: Booking = {
        id: '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0'),
        eventType: {
          id: et?.id ?? body.eventTypeId,
          title: et?.title ?? body.eventTypeId,
          durationMinutes: et?.durationMinutes ?? 30,
        },
        startsAt: body.startsAt,
        endsAt: body.startsAt,
        guestName: body.guestName,
        guestPhone: body.guestPhone,
        guestEmail: body.guestEmail,
        guestComment: body.guestComment,
        createdAt: iso(new Date()),
      }
      return delay(booking)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.slots(variables.eventTypeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings })
    },
  })
}

export function useCreateEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: EventType) => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      return delay(body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
    },
  })
}

export function useUpdateEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ eventTypeId, body }: { eventTypeId: string; body: EventType }) => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      void eventTypeId
      return delay(body)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventType(variables.eventTypeId) })
    },
  })
}

export function useDeleteEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (eventTypeId: string) => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      void eventTypeId
      return delay(undefined)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings })
    },
  })
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WeeklySchedule) => {
      try {
        requireOwner()
      } catch (error) {
        return Promise.reject(error)
      }
      return delay(body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule })
    },
  })
}

// ---------------------------------------------------------------------------
// Гость: профиль
// ---------------------------------------------------------------------------

export function useGuest() {
  return useQuery({
    queryKey: queryKeys.guest,
    queryFn: () => {
      if (!currentGuestId || !guests.has(currentGuestId)) {
        return Promise.reject(new ApiError(404, 'GUEST_UNKNOWN', 'Профиль гостя не найден.'))
      }
      return delay(guests.get(currentGuestId))
    },
    retry: false,
  })
}

export function useCreateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: GuestCreate) => {
      const name = body.name.trim()
      const guestPhone = body.guestPhone?.trim() || undefined
      const guestEmail = body.guestEmail?.trim() || undefined
      if (!name || (!guestPhone && !guestEmail)) {
        return Promise.reject(
          new ApiError(400, 'CONTACT_REQUIRED', 'Укажите имя и хотя бы один контакт: телефон или email.'),
        )
      }
      const id = currentGuestId ?? genToken()
      const profile: GuestProfile = { id, name, guestPhone, guestEmail }
      guests.set(id, profile)
      currentGuestId = id
      persistGuest(profile)
      return delay(profile)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guest })
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: GuestProfile) => {
      if (!currentGuestId || !guests.has(currentGuestId)) {
        return Promise.reject(new ApiError(404, 'GUEST_UNKNOWN', 'Профиль гостя не найден.'))
      }
      const updated: GuestProfile = {
        id: currentGuestId,
        name: body.name.trim(),
        guestPhone: body.guestPhone?.trim() || undefined,
        guestEmail: body.guestEmail?.trim() || undefined,
      }
      guests.set(currentGuestId, updated)
      persistGuest(updated)
      return delay(updated)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guest })
    },
  })
}
