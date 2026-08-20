import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/errors'
import { useEventTypes, useGuest } from '@/api/queries'
import { GuestCard } from '@/components/guest-card'
import { GuestForm } from '@/components/guest-form'
import { QueryError } from '@/components/query-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function EventTypesPage() {
  const query = useEventTypes()
  const guestQuery = useGuest()
  const navigate = useNavigate()
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string | null>(null)

  const isGuestUnknown =
    guestQuery.error instanceof ApiError && guestQuery.error.code === 'GUEST_UNKNOWN'

  if (query.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />
  }

  const eventTypes = query.data

  if (eventTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Пока нет доступных видов записи. Загляните позже.
      </div>
    )
  }

  const selectedEvent = eventTypes.find((eventType) => eventType.id === selectedEventTypeId)
  const guestSectionSelected = isGuestUnknown && selectedEventTypeId !== null

  function handleGuestCreated() {
    if (selectedEventTypeId) {
      navigate(`/book/${selectedEventTypeId}`)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {guestQuery.isPending && <Skeleton className="h-24 w-full" />}
        {guestQuery.data && <GuestCard profile={guestQuery.data} />}
        {guestQuery.isError && !isGuestUnknown && (
          <QueryError error={guestQuery.error} onRetry={() => void guestQuery.refetch()} />
        )}
        {guestSectionSelected && <GuestForm onCreated={handleGuestCreated} />}
      </section>

      {guestSectionSelected ? (
        <div className="space-y-3">
          <Button variant="ghost" onClick={() => setSelectedEventTypeId(null)}>
            ← Выбрать другой вид встречи
          </Button>
          <p className="text-sm text-muted-foreground">
            Заполните данные выше, чтобы записаться на «{selectedEvent?.title}».
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Выберите вид встречи</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            {eventTypes.map((eventType) => (
              <Card key={eventType.id}>
                <CardHeader>
                  <CardTitle>{eventType.title}</CardTitle>
                  <CardAction>
                    <Badge variant="secondary">{eventType.durationMinutes} мин</Badge>
                  </CardAction>
                  <CardDescription>{eventType.description}</CardDescription>
                </CardHeader>
                <CardContent />
                <CardFooter>
                  {isGuestUnknown ? (
                    <Button onClick={() => setSelectedEventTypeId(eventType.id)}>
                      Записаться
                    </Button>
                  ) : (
                    <Button render={<Link to={`/book/${eventType.id}`} />}>
                      Выбрать время
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
