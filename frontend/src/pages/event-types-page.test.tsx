import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { ApiError } from '@/api/errors'
import { EventTypesPage } from './event-types-page'
import { renderWithProviders, queryResult } from '@/test/render'

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return { useEventTypes: fn(), useGuest: fn(), useCreateGuest: fn() }
})

vi.mock('@/api/queries', () => ({
  useEventTypes: mocks.useEventTypes,
  useGuest: mocks.useGuest,
  useCreateGuest: mocks.useCreateGuest,
}))

const GUEST_UNKNOWN = queryResult({
  error: new ApiError(404, 'GUEST_UNKNOWN', 'Профиль гостя не найден.'),
  isError: true,
})

const SAMPLE = [
  {
    id: 'intro-call',
    title: 'Знакомственный звонок',
    description: 'Короткая встреча.',
    durationMinutes: 30,
  },
  {
    id: 'strategy-session',
    title: 'Стратегическая сессия',
    description: 'Глубокий разбор задач.',
    durationMinutes: 60,
  },
]

describe('EventTypesPage', () => {
  beforeEach(() => {
    mocks.useGuest.mockReturnValue(GUEST_UNKNOWN)
    mocks.useCreateGuest.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null })
  })

  it('показывает список типов событий с названием, описанием и длительностью', () => {
    mocks.useEventTypes.mockReturnValue(queryResult({ data: SAMPLE }))
    renderWithProviders(<EventTypesPage />)

    expect(screen.getByText('Знакомственный звонок')).toBeInTheDocument()
    expect(screen.getByText('Короткая встреча.')).toBeInTheDocument()
    expect(screen.getByText('30 мин')).toBeInTheDocument()
    expect(screen.getByText('Стратегическая сессия')).toBeInTheDocument()
    expect(screen.getByText('60 мин')).toBeInTheDocument()
  })

  it('показывает пустое состояние при пустом списке', () => {
    mocks.useEventTypes.mockReturnValue(queryResult({ data: [] }))
    renderWithProviders(<EventTypesPage />)

    expect(screen.getByText('Пока нет доступных видов записи. Загляните позже.')).toBeInTheDocument()
  })

  it('показывает сообщение об ошибке при недоступности сервера', () => {
    mocks.useEventTypes.mockReturnValue(queryResult({ isError: true, error: new ApiError(0, null, 'Сервер недоступен. Проверьте подключение и попробуйте снова.') }))
    renderWithProviders(<EventTypesPage />)

    expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
    expect(screen.getByText(/Сервер недоступен/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })
})
