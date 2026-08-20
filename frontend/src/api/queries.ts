import * as real from './queries.api'
import * as mock from './queries.mock'

/**
 * Переключатель реального API и моков.
 * Задаётся переменной окружения VITE_USE_MOCKS ('true' — моки, иначе реальный API).
 * По умолчанию — реальный API.
 */
const useMocks = import.meta.env.VITE_USE_MOCKS === 'true'

const impl = useMocks ? mock : real

export const queryKeys = impl.queryKeys

export const useEventTypes = impl.useEventTypes
export const useEventType = impl.useEventType
export const useSlots = impl.useSlots
export const useSchedule = impl.useSchedule
export const useBookings = impl.useBookings
export const useCreateBooking = impl.useCreateBooking
export const useCreateEventType = impl.useCreateEventType
export const useUpdateEventType = impl.useUpdateEventType
export const useDeleteEventType = impl.useDeleteEventType
export const useUpdateSchedule = impl.useUpdateSchedule
export const useLoginOwner = impl.useLoginOwner
export const useGuest = impl.useGuest
export const useCreateGuest = impl.useCreateGuest
export const useUpdateGuest = impl.useUpdateGuest

export type {
  EventType,
  WeeklySchedule,
  TimeInterval,
  Slot,
  Booking,
  BookingCreate,
  OwnerLogin,
  GuestProfile,
  GuestCreate,
} from './queries.api'
