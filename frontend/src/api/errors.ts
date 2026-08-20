import type { components } from './schema'

export type BadRequestCode = components['schemas']['BadRequestError']['code']
export type NotFoundCode = components['schemas']['NotFoundError']['code']
export type ConflictCode = components['schemas']['ConflictError']['code']
export type UnauthorizedCode = components['schemas']['UnauthorizedError']['code']
export type LoginThrottledCode = components['schemas']['LoginThrottledError']['code']
export type GuestUnknownCode = components['schemas']['GuestUnknownError']['code']
export type ApiErrorCode =
  | BadRequestCode
  | NotFoundCode
  | ConflictCode
  | UnauthorizedCode
  | LoginThrottledCode
  | GuestUnknownCode

/** Все коды ошибок, зафиксированные в контракте API. */
const KNOWN_CODES: readonly ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'CONTACT_REQUIRED',
  'SLOT_MISALIGNED',
  'SLOT_OUT_OF_WINDOW',
  'SLOT_OUTSIDE_SCHEDULE',
  'EVENT_TYPE_NOT_FOUND',
  'DUPLICATE_EVENT_TYPE_ID',
  'SLOT_BUSY',
  'INVALID_CREDENTIALS',
  'NO_OWNER_SESSION',
  'LOGIN_ATTEMPTS_EXCEEDED',
  'GUEST_UNKNOWN',
]

/** Типизированная ошибка API: HTTP-статус + код из контракта (null, если код неизвестен). */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | null

  constructor(status: number, code: ApiErrorCode | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (KNOWN_CODES as readonly string[]).includes(value)
}

/** Разбирает тело ответа об ошибке ({ code, message }) в типизированный ApiError. */
export function toApiError(status: number, body: unknown): ApiError {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = isApiErrorCode(record.code) ? record.code : null
  const message = typeof record.message === 'string' ? record.message : `Ошибка ${status}`
  return new ApiError(status, code, message)
}

/** Ошибка сети/недоступности сервера. */
export function networkError(): ApiError {
  return new ApiError(0, null, 'Сервер недоступен. Проверьте подключение и попробуйте снова.')
}

interface FetchLikeResult<T> {
  data?: T
  error?: unknown
  response?: Response
}

/**
 * Разворачивает результат openapi-fetch: возвращает данные либо выбрасывает ApiError.
 * Использовать во всех запросах к API.
 */
export async function unwrap<T>(result: Promise<FetchLikeResult<T>>): Promise<T> {
  let resolved: FetchLikeResult<T>
  try {
    resolved = await result
  } catch {
    throw networkError()
  }
  if (resolved.error !== undefined || (resolved.response && !resolved.response.ok)) {
    throw toApiError(resolved.response?.status ?? 0, resolved.error)
  }
  return resolved.data as T
}

/** Коды, для которых пользователю показывается текст message из ответа API. */
const SERVER_MESSAGE_CODES: readonly ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'SLOT_MISALIGNED',
  'SLOT_OUT_OF_WINDOW',
  'SLOT_OUTSIDE_SCHEDULE',
]

const FIXED_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  CONTACT_REQUIRED: 'Укажите хотя бы один контакт: телефон или email.',
  EVENT_TYPE_NOT_FOUND: 'Тип события не найден или больше недоступен.',
  DUPLICATE_EVENT_TYPE_ID: 'Тип события с таким идентификатором уже существует.',
  SLOT_BUSY: 'Это время уже занято. Выберите другой слот.',
  INVALID_CREDENTIALS: 'Неверный логин или пароль.',
  NO_OWNER_SESSION: 'Сессия владельца не найдена. Войдите в админку заново.',
  LOGIN_ATTEMPTS_EXCEEDED: 'Слишком много попыток входа. Попробуйте позже.',
  GUEST_UNKNOWN: 'Профиль гостя не найден.',
}

/** Пользовательское сообщение об ошибке по коду из контракта. */
export function errorMessage(error: unknown): string {  if (error instanceof ApiError) {
    if (error.code && SERVER_MESSAGE_CODES.includes(error.code)) {
      return error.message
    }
    const fixed = error.code ? FIXED_MESSAGES[error.code] : undefined
    if (fixed) {
      return fixed
    }
    return error.message
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}

/** true, если ошибка — это HTTP 401 (сессия владельца истекла/недействительна). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}
