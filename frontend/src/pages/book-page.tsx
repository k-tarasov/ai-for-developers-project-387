import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'

import { ApiError, errorMessage } from '@/api/errors'
import { queryKeys, useCreateBooking, useEventType, useGuest, useSlots } from '@/api/queries'
import type { Booking, Slot } from '@/api/queries'
import { QueryError } from '@/components/query-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ru } from 'react-day-picker/locale'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatUtcDate, formatUtcDateTime, formatUtcTime, groupSlotsByDay, utcDayKey } from '@/lib/datetime'

/** Ключ дня (YYYY-MM-DD) из локальных компонентов Date — совпадает с UTC-ключом слота. */
function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const bookingFormSchema = z.object({
  guestComment: z.string(),
})

type BookingFormValues = z.infer<typeof bookingFormSchema>

function Confirmation({ booking, onReset }: { booking: Booking; onReset: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вы записаны</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="font-medium">{booking.eventType.title}</span> (
          {booking.eventType.durationMinutes} мин)
        </p>
        <p>
          {formatUtcDateTime(booking.startsAt)} – {formatUtcTime(booking.endsAt)} UTC
        </p>
        <p className="text-muted-foreground">Гость: {booking.guestName}</p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onReset}>
            Записать ещё
          </Button>
          <Button variant="ghost" render={<Link to="/" />}>
            К списку видов встреч
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function BookPage() {
  const { eventTypeId = '' } = useParams()
  const eventTypeQuery = useEventType(eventTypeId)
  const slotsQuery = useSlots(eventTypeId)
  const createBooking = useCreateBooking()
  const guestQuery = useGuest()
  const queryClient = useQueryClient()

  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [created, setCreated] = useState<Booking | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined)

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { guestComment: '' },
  })

  const isNotFound =
    (eventTypeQuery.error instanceof ApiError && eventTypeQuery.error.code === 'EVENT_TYPE_NOT_FOUND') ||
    (slotsQuery.error instanceof ApiError && slotsQuery.error.code === 'EVENT_TYPE_NOT_FOUND')

  if (isNotFound) {
    return (
      <Alert>
        <AlertTitle>Тип события недоступен</AlertTitle>
        <AlertDescription>
          Такой вид встречи не найден или больше не принимает запись.{' '}
          <Link to="/" className="underline">
            Вернуться к списку видов встреч
          </Link>
        </AlertDescription>
      </Alert>
    )
  }

  if (eventTypeQuery.isPending || slotsQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (eventTypeQuery.isError) {
    return <QueryError error={eventTypeQuery.error} onRetry={() => void eventTypeQuery.refetch()} />
  }

  if (slotsQuery.isError) {
    return <QueryError error={slotsQuery.error} onRetry={() => void slotsQuery.refetch()} />
  }

  const eventType = eventTypeQuery.data
  const { slots, windowStartsOn, windowEndsOn } = slotsQuery.data

  const windowStartsOnDate = new Date(`${windowStartsOn}T00:00:00`)
  const windowEndsOnDate = new Date(`${windowEndsOn}T00:00:00`)
  const availableDays = new Set(groupSlotsByDay(slots).map(([key]) => key))
  const firstAvailableDay = (() => {
    const first = groupSlotsByDay(slots).at(0)?.[0]
    return first ? new Date(`${first}T00:00:00`) : undefined
  })()
  const effectiveSelectedDay = selectedDay ?? firstAvailableDay
  const daySlots = slots
    .filter(
      (slot) =>
        effectiveSelectedDay !== undefined &&
        utcDayKey(slot.startsAt) === localDayKey(effectiveSelectedDay),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const selectedDayLabel = effectiveSelectedDay
    ? formatUtcDate(`${localDayKey(effectiveSelectedDay)}T00:00:00Z`)
    : ''

  function handleDaySelect(day: Date | undefined) {
    if (!day) return
    setSelectedDay(day)
    const key = localDayKey(day)
    if (selectedSlot && utcDayKey(selectedSlot.startsAt) !== key) {
      setSelectedSlot(null)
    }
  }

  if (created) {
    return <Confirmation booking={created} onReset={() => { setCreated(null); setSelectedSlot(null); form.reset(); createBooking.reset() }} />
  }

  function handleSubmit(values: BookingFormValues) {
    if (!selectedSlot || !guestQuery.data) return
    const profile = guestQuery.data
    createBooking.mutate(
      {
        eventTypeId,
        startsAt: selectedSlot.startsAt,
        guestName: profile.name,
        guestPhone: profile.guestPhone || undefined,
        guestEmail: profile.guestEmail || undefined,
        guestComment: values.guestComment.trim() || undefined,
      },
      {
        onSuccess: (booking) => setCreated(booking),
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'SLOT_BUSY') {
            setSelectedSlot(null)
            void queryClient.invalidateQueries({ queryKey: queryKeys.slots(eventTypeId) })
          }
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{eventType.title}</h1>
        <p className="text-muted-foreground">{eventType.durationMinutes} мин</p>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          В ближайшие 14 дней свободного времени нет.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{eventType.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{eventType.durationMinutes} мин</p>
                <p className="text-muted-foreground">
                  Окно записи: {windowStartsOn} – {windowEndsOn} (UTC)
                </p>
              </CardContent>
            </Card>

             <section className="space-y-3">
               <h2 className="text-lg font-medium">Ваши данные</h2>
               {createBooking.isError && (
                 <Alert variant="destructive">
                   <AlertTitle>Не удалось создать запись</AlertTitle>
                   <AlertDescription>{errorMessage(createBooking.error)}</AlertDescription>
                 </Alert>
               )}
               {guestQuery.isPending ? (
                 <Skeleton className="h-24 w-full" />
               ) : guestQuery.data ? (
                 <div className="space-y-4">
                   <div className="rounded-lg border p-4 text-sm">
                     <p className="font-medium">{guestQuery.data.name}</p>
                     {guestQuery.data.guestPhone && (
                       <p className="text-muted-foreground">{guestQuery.data.guestPhone}</p>
                     )}
                     {guestQuery.data.guestEmail && (
                       <p className="text-muted-foreground">{guestQuery.data.guestEmail}</p>
                     )}
                   </div>
                   <Form {...form}>
                     <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                       <FormField
                         control={form.control}
                         name="guestComment"
                         render={({ field }) => (
                           <FormItem>
                             <FormLabel>Комментарий (необязательно)</FormLabel>
                             <FormControl>
                               <Textarea {...field} />
                             </FormControl>
                             <FormMessage />
                           </FormItem>
                         )}
                       />
                       <Button type="submit" disabled={!selectedSlot || createBooking.isPending}>
                         {createBooking.isPending
                           ? 'Записываем…'
                           : selectedSlot
                             ? `Записаться на ${formatUtcDateTime(selectedSlot.startsAt)} UTC`
                             : 'Сначала выберите время'}
                       </Button>
                     </form>
                   </Form>
                 </div>
               ) : (
                 <Alert>
                   <AlertTitle>Нужны ваши данные</AlertTitle>
                   <AlertDescription>
                     Заполните профиль на{' '}
                     <Link to="/" className="underline">
                       главной странице
                     </Link>
                     , чтобы записаться.
                   </AlertDescription>
                 </Alert>
               )}
             </section>
          </div>

          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={effectiveSelectedDay}
              onSelect={handleDaySelect}
              defaultMonth={windowStartsOnDate}
              captionLayout="dropdown"
              locale={ru}
              classNames={{ root: 'w-full' }}
              disabled={[
                { before: windowStartsOnDate },
                { after: windowEndsOnDate },
                (date: Date) => !availableDays.has(localDayKey(date)),
              ]}
            />
          </div>

          <div className="flex min-h-0 flex-col">
            <h2 className="mb-2 shrink-0 text-lg font-medium">
              {selectedDayLabel} (UTC)
            </h2>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет свободных слотов.</p>
              ) : (
                daySlots.map((slot) => (
                  <Button
                    key={slot.startsAt}
                    variant={selectedSlot?.startsAt === slot.startsAt ? 'default' : 'outline'}
                    className="w-full"
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatUtcTime(slot.startsAt)}
                  </Button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
