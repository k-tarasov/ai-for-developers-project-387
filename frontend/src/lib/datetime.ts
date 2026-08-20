/**
 * Форматирование дат и времени строго в UTC (по контракту API).
 * В интерфейсе время всегда помечается «UTC».
 */

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** "14:30" (UTC) из ISO-даты-времени. */
export function formatUtcTime(iso: string): string {
  return timeFormatter.format(new Date(iso))
}

/** "пн, 17 августа" (UTC) из ISO-даты-времени. */
export function formatUtcDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/** "17 августа, 14:30" (UTC) из ISO-даты-времени. */
export function formatUtcDateTime(iso: string): string {
  return `${dateFormatter.format(new Date(iso))}, ${timeFormatter.format(new Date(iso))}`
}

/** Ключ дня YYYY-MM-DD в UTC для группировки. */
export function utcDayKey(iso: string): string {
  const d = new Date(iso)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Группирует слоты по дням (UTC), сохраняя порядок по возрастанию startsAt. */
export function groupSlotsByDay<T extends { startsAt: string }>(slots: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const slot of slots) {
    const key = utcDayKey(slot.startsAt)
    const list = groups.get(key)
    if (list) {
      list.push(slot)
    } else {
      groups.set(key, [slot])
    }
  }
  return [...groups.entries()]
}

/** Нормализует время контракта (HH:mm, возможно HH:mm:ss) к виду HH:mm. */
export function normalizeTime(value: string): string {
  return value.slice(0, 5)
}
