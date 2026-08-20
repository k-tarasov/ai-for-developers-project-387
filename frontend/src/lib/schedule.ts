import type { WeeklySchedule } from '@/api/queries'
import { normalizeTime } from '@/lib/datetime'

export const DAYS: { key: keyof WeeklySchedule; label: string }[] = [
  { key: 'mon', label: 'Понедельник' },
  { key: 'tue', label: 'Вторник' },
  { key: 'wed', label: 'Среда' },
  { key: 'thu', label: 'Четверг' },
  { key: 'fri', label: 'Пятница' },
  { key: 'sat', label: 'Суббота' },
  { key: 'sun', label: 'Воскресенье' },
]

export function emptySchedule(): WeeklySchedule {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

/** Нормализует расписание из API (время может прийти как HH:mm:ss) к HH:mm. */
export function normalizeSchedule(schedule: WeeklySchedule): WeeklySchedule {
  const normalized = {} as WeeklySchedule
  for (const { key } of DAYS) {
    const intervals = schedule[key] ?? []
    normalized[key] = intervals.map((interval) => ({
      start: normalizeTime(interval.start),
      end: normalizeTime(interval.end),
    }))
  }
  return normalized
}
