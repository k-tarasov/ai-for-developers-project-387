import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { errorMessage } from '@/api/errors'
import type { EventType } from '@/api/queries'
import {
  useCreateEventType,
  useDeleteEventType,
  useEventTypes,
  useUpdateEventType,
} from '@/api/queries'
import { useHandleUnauthorized } from '@/auth/use-handle-unauthorized'
import { QueryError } from '@/components/query-error'
import { WeeklyScheduleEditor } from '@/components/weekly-schedule-editor'
import { emptySchedule, normalizeSchedule } from '@/lib/schedule'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const timeIntervalSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Формат HH:mm'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Формат HH:mm'),
  })
  .refine((interval) => interval.end > interval.start, {
    message: 'Конец интервала должен быть позже начала',
  })

const weeklyScheduleSchema = z.object({
  mon: z.array(timeIntervalSchema),
  tue: z.array(timeIntervalSchema),
  wed: z.array(timeIntervalSchema),
  thu: z.array(timeIntervalSchema),
  fri: z.array(timeIntervalSchema),
  sat: z.array(timeIntervalSchema),
  sun: z.array(timeIntervalSchema),
})

const eventTypeFormSchema = z.object({
  id: z
    .string()
    .min(1, 'Укажите идентификатор')
    .max(63, 'Не длиннее 63 символов')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Строчные буквы, цифры и дефисы, например intro-call'),
  title: z.string().min(1, 'Укажите название'),
  description: z.string().min(1, 'Укажите описание'),
  durationMinutes: z
    .string()
    .regex(/^\d+$/, 'Укажите длительность в минутах')
    .refine((v) => {
      const n = Number(v)
      return n >= 15 && n <= 180
    }, 'От 15 до 180 минут')
    .refine((v) => Number(v) % 15 === 0, 'Длительность должна быть кратна 15'),
  hasOwnAvailability: z.boolean(),
  availability: weeklyScheduleSchema,
})

type EventTypeFormValues = z.infer<typeof eventTypeFormSchema>

interface EventTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: EventType
  resetKey: number
}

function EventTypeFormDialog({ open, onOpenChange, initial, resetKey }: EventTypeFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <EventTypeForm key={resetKey} initial={initial} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

interface EventTypeFormProps {
  initial?: EventType
  onOpenChange: (open: boolean) => void
}

function EventTypeForm({ initial, onOpenChange }: EventTypeFormProps) {
  const createEventType = useCreateEventType()
  const updateEventType = useUpdateEventType()
  const [submitError, setSubmitError] = useState<unknown>(null)
  useHandleUnauthorized(submitError, submitError != null)

  const form = useForm<EventTypeFormValues>({
    resolver: zodResolver(eventTypeFormSchema),
    defaultValues: {
      id: initial?.id ?? '',
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      durationMinutes: String(initial?.durationMinutes ?? 30),
      hasOwnAvailability: initial?.availability != null,
      availability: initial?.availability
        ? normalizeSchedule(initial.availability)
        : emptySchedule(),
    },
  })

  const isEdit = initial != null
  const isPending = createEventType.isPending || updateEventType.isPending
  const hasOwnAvailability = useWatch({
    control: form.control,
    name: 'hasOwnAvailability',
  })

  function handleSubmit(values: EventTypeFormValues) {
    const body: EventType = {
      id: values.id,
      title: values.title.trim(),
      description: values.description.trim(),
      durationMinutes: Number(values.durationMinutes),
      availability: values.hasOwnAvailability ? values.availability : undefined,
    }
    const mutation = isEdit
      ? updateEventType.mutateAsync({ eventTypeId: initial.id, body })
      : createEventType.mutateAsync(body)
    mutation
      .then(() => onOpenChange(false))
      .catch((error) => setSubmitError(error))
  }

  return (
    <>
      <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать тип события' : 'Новый тип события'}</DialogTitle>
          <DialogDescription>
            Вид записи, который гости видят на странице бронирования.
          </DialogDescription>
        </DialogHeader>
        {submitError != null && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось сохранить</AlertTitle>
            <AlertDescription>{errorMessage(submitError)}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Идентификатор (slug)</FormLabel>
                  <FormControl>
                    <Input placeholder="intro-call" disabled={isEdit || isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input placeholder="Знакомственный звонок" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание</FormLabel>
                  <FormControl>
                    <Textarea disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Длительность, минут</FormLabel>
                  <FormControl>
                    <Input type="number" min={15} max={180} step={15} disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hasOwnAvailability"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Собственное расписание доступности</FormLabel>
                </FormItem>
              )}
            />
            {hasOwnAvailability && (
              <FormField
                control={form.control}
                name="availability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Расписание этого типа события (UTC)</FormLabel>
                    <FormControl>
                      <WeeklyScheduleEditor
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                    {form.formState.errors.availability && (
                      <p className="text-sm text-destructive">
                        Проверьте интервалы: конец должен быть позже начала
                      </p>
                    )}
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
    </>
  )
}

export function AdminEventTypesPage() {
  const query = useEventTypes()
  const deleteEventType = useDeleteEventType()
  useHandleUnauthorized(query.error, query.isError)
  useHandleUnauthorized(deleteEventType.error, deleteEventType.isError)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EventType | undefined>(undefined)
  const [formNonce, setFormNonce] = useState(0)
  const [deleting, setDeleting] = useState<EventType | undefined>(undefined)

  if (query.isPending) {
    return <Skeleton className="h-64 w-full" />
  }

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />
  }

  const eventTypes = query.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Типы событий</h1>
        <Button
          onClick={() => {
            setEditing(undefined)
            setFormNonce((n) => n + 1)
            setFormOpen(true)
          }}
        >
          <PlusIcon />
          Создать
        </Button>
      </div>

      {eventTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Типов событий пока нет. Создайте первый.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Идентификатор</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Длительность</TableHead>
              <TableHead>Расписание</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventTypes.map((eventType) => (
              <TableRow key={eventType.id}>
                <TableCell className="font-mono text-xs">{eventType.id}</TableCell>
                <TableCell>{eventType.title}</TableCell>
                <TableCell>{eventType.durationMinutes} мин</TableCell>
                <TableCell>
                  <Badge variant={eventType.availability ? 'default' : 'secondary'}>
                    {eventType.availability ? 'Собственное' : 'По умолчанию'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Редактировать"
                    onClick={() => {
                      setEditing(eventType)
                      setFormNonce((n) => n + 1)
                      setFormOpen(true)
                    }}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Удалить"
                    onClick={() => setDeleting(eventType)}
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EventTypeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        resetKey={formNonce}
      />

      <Dialog open={deleting != null} onOpenChange={(open) => !open && setDeleting(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить тип события?</DialogTitle>
            <DialogDescription>
              «{deleting?.title}» будет удалён. Существующие брони этого типа сохранятся, новые
              создать будет нельзя.
            </DialogDescription>
          </DialogHeader>
          {deleteEventType.isError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось удалить</AlertTitle>
              <AlertDescription>{errorMessage(deleteEventType.error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(undefined)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={deleteEventType.isPending}
              onClick={() => {
                if (!deleting) return
                deleteEventType.mutate(deleting.id, {
                  onSuccess: () => setDeleting(undefined),
                })
              }}
            >
              {deleteEventType.isPending ? 'Удаляем…' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
