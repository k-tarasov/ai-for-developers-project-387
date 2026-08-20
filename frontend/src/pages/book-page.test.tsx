import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiError } from '@/api/errors'
import type { Booking } from '@/api/queries'
import { BookPage } from './book-page'
import { queryResult, renderWithProviders } from '@/test/render'

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    useEventType: fn(),
    useSlots: fn(),
    useCreateBooking: fn(),
    useGuest: fn(),
    queryKeys: {
      eventTypes: ['event-types'],
      eventType: (id: string) => ['event-types', id],
      slots: (id: string) => ['slots', id],
      schedule: ['schedule'],
      bookings: ['bookings'],
    },
  }
})

vi.mock('@/api/queries', () => ({
  useEventType: mocks.useEventType,
  useSlots: mocks.useSlots,
  useCreateBooking: mocks.useCreateBooking,
  useGuest: mocks.useGuest,
  queryKeys: mocks.queryKeys,
}))

const EVENT_TYPE = { id: 'intro-call', title: 'Знакомственный звонок', description: 'desc', durationMinutes: 30 }
const GUEST = { id: 'g1', name: 'Иван', guestPhone: '+79990000000', guestEmail: 'i@example.com' }
const SLOTS = {
  windowStartsOn: '2026-08-18',
  windowEndsOn: '2026-08-31',
  slots: [
    { startsAt: '2026-08-18T09:00:00Z', endsAt: '2026-08-18T09:30:00Z' },
    { startsAt: '2026-08-18T09:30:00Z', endsAt: '2026-08-18T10:00:00Z' },
    { startsAt: '2026-08-18T10:00:00Z', endsAt: '2026-08-18T10:30:00Z' },
    { startsAt: '2026-08-20T14:00:00Z', endsAt: '2026-08-20T14:30:00Z' },
    { startsAt: '2026-08-20T14:30:00Z', endsAt: '2026-08-20T15:00:00Z' },
  ],
}

function renderBookPage(createBookingMock: ReturnType<typeof baseBookingMock> = baseBookingMock(() => {})) {
  mocks.useEventType.mockReturnValue(queryResult({ data: EVENT_TYPE }))
  mocks.useSlots.mockReturnValue(queryResult({ data: SLOTS }))
  mocks.useGuest.mockReturnValue(queryResult({ data: GUEST }))
  mocks.useCreateBooking.mockReturnValue(createBookingMock)
  return renderWithProviders(<BookPage />, { route: '/book/intro-call' })
}

type MutationMock = {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  error: unknown
  data: unknown
  reset: ReturnType<typeof vi.fn>
}

function baseBookingMock(
  mutate: (vars: unknown, opts?: { onSuccess?: (b: Booking) => void; onError?: (e: unknown) => void }) => void,
): MutationMock {
  return { mutate: vi.fn(mutate), isPending: false, isError: false, error: null, data: undefined, reset: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookPage', () => {
  it('показывает слоты по дням при успешной загрузке', () => {
    renderBookPage()
    expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
    expect(screen.getByText(/Окно записи:/)).toBeInTheDocument()
  })

  it('показывает слоты выбранного дня и блокирует дни без слотов', async () => {
    const user = userEvent.setup()
    renderBookPage()

    // первый доступный день предвыбран — слоты 18-го числа видны
    expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()

    // день без слотов (19-е) внутри окна недоступен
    expect(screen.getByText('19').closest('button')).toBeDisabled()

    // переключаемся на другой доступный день в календаре
    await user.click(screen.getByText('20'))

    expect(screen.getByRole('button', { name: '14:00' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
  })

  it('показывает сообщение при ошибке EVENT_TYPE_NOT_FOUND', () => {
    mocks.useEventType.mockReturnValue(
      queryResult({ isError: true, error: new ApiError(404, 'EVENT_TYPE_NOT_FOUND', 'x') }),
    )
    mocks.useSlots.mockReturnValue(queryResult({ data: SLOTS }))
    mocks.useGuest.mockReturnValue(queryResult({ data: GUEST }))
    renderWithProviders(<BookPage />, { route: '/book/missing' })

    expect(screen.getByText('Тип события недоступен')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Вернуться к списку/ })).toBeInTheDocument()
  })

  it('создаёт бронь, используя данные профиля гостя', async () => {
    const user = userEvent.setup()
    const booking: Booking = {
      id: 'b1',
      eventType: { id: 'intro-call', title: 'Знакомственный звонок', durationMinutes: 30 },
      startsAt: SLOTS.slots[0].startsAt,
      endsAt: SLOTS.slots[0].endsAt,
      guestName: 'Иван',
      createdAt: '2026-08-17T00:00:00Z',
    }
    renderBookPage(baseBookingMock((_vars, opts) => opts?.onSuccess?.(booking)))

    await user.click(screen.getByRole('button', { name: '09:00' }))
    await user.click(screen.getByRole('button', { name: /Записаться на/ }))

    await waitFor(() => expect(screen.getByText('Вы записаны')).toBeInTheDocument())
    const mutate = mocks.useCreateBooking.mock.results[0].value.mutate as ReturnType<typeof vi.fn>
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ guestName: 'Иван', guestPhone: '+79990000000' }),
      expect.anything(),
    )
  })

  it('показывает сообщение SLOT_BUSY при конфликте слота', async () => {
    const user = userEvent.setup()
    const slotBusyMock: ReturnType<typeof baseBookingMock> = {
      ...baseBookingMock((_vars, opts) =>
        opts?.onError?.(new ApiError(409, 'SLOT_BUSY', 'Это время уже занято. Выберите другой слот.')),
      ),
      isError: true,
      error: new ApiError(409, 'SLOT_BUSY', 'Это время уже занято. Выберите другой слот.'),
    }
    renderBookPage(slotBusyMock)

    await user.click(screen.getByRole('button', { name: '09:00' }))
    await user.click(screen.getByRole('button', { name: /Записаться на/ }))

    expect(await screen.findByText('Это время уже занято. Выберите другой слот.')).toBeInTheDocument()
  })
})
