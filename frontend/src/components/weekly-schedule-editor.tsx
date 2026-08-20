import { PlusIcon, XIcon } from 'lucide-react'

import type { TimeInterval, WeeklySchedule } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DAYS } from '@/lib/schedule'

interface WeeklyScheduleEditorProps {
  value: WeeklySchedule
  onChange: (value: WeeklySchedule) => void
  disabled?: boolean
}

export function WeeklyScheduleEditor({ value, onChange, disabled }: WeeklyScheduleEditorProps) {
  function updateInterval(day: keyof WeeklySchedule, index: number, patch: Partial<TimeInterval>) {
    const intervals = (value[day] ?? []).map((interval, i) =>
      i === index ? { ...interval, ...patch } : interval,
    )
    onChange({ ...value, [day]: intervals })
  }

  function addInterval(day: keyof WeeklySchedule) {
    onChange({ ...value, [day]: [...(value[day] ?? []), { start: '09:00', end: '13:00' }] })
  }

  function removeInterval(day: keyof WeeklySchedule, index: number) {
    onChange({ ...value, [day]: (value[day] ?? []).filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {DAYS.map(({ key, label }) => (
        <div key={key} className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-medium">{label}</span>
          {(value[key] ?? []).length === 0 && (
            <span className="text-sm text-muted-foreground">Недоступно</span>
          )}
          {(value[key] ?? []).map((interval, index) => (
            <span key={index} className="flex items-center gap-1">
              <Input
                type="time"
                className="w-28"
                value={interval.start}
                disabled={disabled}
                onChange={(e) => updateInterval(key, index, { start: e.target.value })}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                className="w-28"
                value={interval.end}
                disabled={disabled}
                onChange={(e) => updateInterval(key, index, { end: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => removeInterval(key, index)}
                aria-label="Удалить интервал"
              >
                <XIcon />
              </Button>
            </span>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => addInterval(key)}
          >
            <PlusIcon />
            Интервал
          </Button>
        </div>
      ))}
    </div>
  )
}
