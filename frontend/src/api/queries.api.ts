import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { unwrap } from './errors'
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

export function useEventTypes() {
  return useQuery({
    queryKey: queryKeys.eventTypes,
    queryFn: () => unwrap(api.GET('/event-types')),
  })
}

export function useEventType(eventTypeId: string) {
  return useQuery({
    queryKey: queryKeys.eventType(eventTypeId),
    queryFn: () => unwrap(api.GET('/event-types/{eventTypeId}', { params: { path: { eventTypeId } } })),
  })
}

export function useSlots(eventTypeId: string) {
  return useQuery({
    queryKey: queryKeys.slots(eventTypeId),
    queryFn: () =>
      unwrap(api.GET('/event-types/{eventTypeId}/slots', { params: { path: { eventTypeId } } })),
  })
}

export function useSchedule() {
  return useQuery({
    queryKey: queryKeys.schedule,
    queryFn: () => unwrap(api.GET('/schedule')),
  })
}

export function useBookings() {
  return useQuery({
    queryKey: queryKeys.bookings,
    queryFn: () => unwrap(api.GET('/bookings')),
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BookingCreate) => unwrap(api.POST('/bookings', { body })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.slots(variables.eventTypeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings })
    },
  })
}

export function useCreateEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: EventType) => unwrap(api.POST('/event-types', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
    },
  })
}

export function useUpdateEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ eventTypeId, body }: { eventTypeId: string; body: EventType }) =>
      unwrap(api.PUT('/event-types/{eventTypeId}', { params: { path: { eventTypeId } }, body })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventType(variables.eventTypeId) })
    },
  })
}

export function useDeleteEventType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (eventTypeId: string) =>
      unwrap(api.DELETE('/event-types/{eventTypeId}', { params: { path: { eventTypeId } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings })
    },
  })
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WeeklySchedule) => unwrap(api.PUT('/schedule', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule })
    },
  })
}

export function useLoginOwner() {
  return useMutation({
    mutationFn: (body: OwnerLogin) => unwrap(api.POST('/auth/login', { body })),
  })
}

export function useGuest() {
  return useQuery({
    queryKey: queryKeys.guest,
    queryFn: () => unwrap(api.GET('/guest')),
    retry: false,
  })
}

export function useCreateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: GuestCreate) => unwrap(api.POST('/guest', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guest })
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: GuestProfile) => unwrap(api.PUT('/guest', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guest })
    },
  })
}
