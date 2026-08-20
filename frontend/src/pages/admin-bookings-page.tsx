import { useBookings } from '@/api/queries'
import { useHandleUnauthorized } from '@/auth/use-handle-unauthorized'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatUtcDateTime, formatUtcTime } from '@/lib/datetime'

export function AdminBookingsPage() {
  const query = useBookings()
  useHandleUnauthorized(query.error, query.isError)

  if (query.isPending) {
    return <Skeleton className="h-64 w-full" />
  }

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />
  }

  const bookings = query.data

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Предстоящие брони</h1>

      {bookings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Предстоящих броней нет.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время (UTC)</TableHead>
              <TableHead>Тип события</TableHead>
              <TableHead>Гость</TableHead>
              <TableHead>Контакты</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>
                  {formatUtcDateTime(booking.startsAt)} – {formatUtcTime(booking.endsAt)}
                </TableCell>
                <TableCell>
                  {booking.eventType.title} ({booking.eventType.durationMinutes} мин)
                </TableCell>
                <TableCell>{booking.guestName}</TableCell>
                <TableCell>
                  {[booking.guestPhone, booking.guestEmail].filter(Boolean).join(', ')}
                </TableCell>
                <TableCell className="max-w-48 truncate">{booking.guestComment ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
