import { useState } from 'react'

import { errorMessage } from '@/api/errors'
import type { WeeklySchedule } from '@/api/queries'
import { useSchedule, useUpdateSchedule } from '@/api/queries'
import { useHandleUnauthorized } from '@/auth/use-handle-unauthorized'
import { QueryError } from '@/components/query-error'
import { WeeklyScheduleEditor } from '@/components/weekly-schedule-editor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { normalizeSchedule } from '@/lib/schedule'

function ScheduleEditor({ initialSchedule }: { initialSchedule: WeeklySchedule }) {
  const updateSchedule = useUpdateSchedule()
  useHandleUnauthorized(updateSchedule.error, updateSchedule.isError)
  const [draft, setDraft] = useState<WeeklySchedule>(() => normalizeSchedule(initialSchedule))
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(false)
    updateSchedule.mutate(draft, {
      onSuccess: () => setSaved(true),
    })
  }

  return (
    <>
      {updateSchedule.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось сохранить расписание</AlertTitle>
          <AlertDescription>{errorMessage(updateSchedule.error)}</AlertDescription>
        </Alert>
      )}
      {saved && !updateSchedule.isPending && (
        <Alert>
          <AlertTitle>Расписание сохранено</AlertTitle>
        </Alert>
      )}

      <WeeklyScheduleEditor
        value={draft}
        onChange={(value) => {
          setDraft(value)
          setSaved(false)
        }}
        disabled={updateSchedule.isPending}
      />
      <Button onClick={handleSave} disabled={updateSchedule.isPending}>
        {updateSchedule.isPending ? 'Сохраняем…' : 'Сохранить расписание'}
      </Button>
    </>
  )
}

export function AdminSchedulePage() {
  const query = useSchedule()
  useHandleUnauthorized(query.error, query.isError)

  if (query.isPending) {
    return <Skeleton className="h-64 w-full" />
  }

  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Расписание по умолчанию (UTC)</h1>
      <p className="text-sm text-muted-foreground">
        Используется для всех типов событий без собственного расписания. Пустой день — запись
        недоступна.
      </p>

      <ScheduleEditor initialSchedule={query.data} />
    </div>
  )
}
