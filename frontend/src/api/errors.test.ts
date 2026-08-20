import { describe, expect, it } from 'vitest'

import { ApiError, errorMessage, networkError, toApiError, unwrap } from './errors'

describe('toApiError', () => {
  it('разбирает 400 VALIDATION_ERROR', () => {
    const err = toApiError(400, { code: 'VALIDATION_ERROR', message: 'bad input' })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('bad input')
  })

  it('разбирает 400 CONTACT_REQUIRED', () => {
    const err = toApiError(400, { code: 'CONTACT_REQUIRED', message: 'contact needed' })
    expect(err.code).toBe('CONTACT_REQUIRED')
  })

  it('разбирает 400 SLOT_MISALIGNED', () => {
    expect(toApiError(400, { code: 'SLOT_MISALIGNED', message: 'm' }).code).toBe('SLOT_MISALIGNED')
  })

  it('разбирает 400 SLOT_OUT_OF_WINDOW', () => {
    expect(toApiError(400, { code: 'SLOT_OUT_OF_WINDOW', message: 'm' }).code).toBe(
      'SLOT_OUT_OF_WINDOW',
    )
  })

  it('разбирает 400 SLOT_OUTSIDE_SCHEDULE', () => {
    expect(toApiError(400, { code: 'SLOT_OUTSIDE_SCHEDULE', message: 'm' }).code).toBe(
      'SLOT_OUTSIDE_SCHEDULE',
    )
  })

  it('разбирает 404 EVENT_TYPE_NOT_FOUND', () => {
    const err = toApiError(404, { code: 'EVENT_TYPE_NOT_FOUND', message: 'not found' })
    expect(err.status).toBe(404)
    expect(err.code).toBe('EVENT_TYPE_NOT_FOUND')
  })

  it('разбирает 409 DUPLICATE_EVENT_TYPE_ID', () => {
    expect(toApiError(409, { code: 'DUPLICATE_EVENT_TYPE_ID', message: 'm' }).code).toBe(
      'DUPLICATE_EVENT_TYPE_ID',
    )
  })

  it('разбирает 409 SLOT_BUSY', () => {
    expect(toApiError(409, { code: 'SLOT_BUSY', message: 'm' }).code).toBe('SLOT_BUSY')
  })

  it('неизвестный код → code = null', () => {
    const err = toApiError(500, { code: 'UNKNOWN', message: 'boom' })
    expect(err.code).toBeNull()
    expect(err.message).toBe('boom')
  })

  it('тело без message → сообщение со статусом', () => {
    const err = toApiError(500, null)
    expect(err.code).toBeNull()
    expect(err.message).toBe('Ошибка 500')
  })
})

describe('errorMessage', () => {
  it('для кодов валидации слота возвращает текст из ответа API', () => {
    const err = new ApiError(400, 'SLOT_MISALIGNED', 'Начало должно быть кратно 15 минутам')
    expect(errorMessage(err)).toBe('Начало должно быть кратно 15 минутам')
  })

  it('CONTACT_REQUIRED → фиксированное сообщение', () => {
    expect(errorMessage(new ApiError(400, 'CONTACT_REQUIRED', 'x'))).toBe(
      'Укажите хотя бы один контакт: телефон или email.',
    )
  })

  it('EVENT_TYPE_NOT_FOUND → фиксированное сообщение', () => {
    expect(errorMessage(new ApiError(404, 'EVENT_TYPE_NOT_FOUND', 'x'))).toBe(
      'Тип события не найден или больше недоступен.',
    )
  })

  it('DUPLICATE_EVENT_TYPE_ID → фиксированное сообщение', () => {
    expect(errorMessage(new ApiError(409, 'DUPLICATE_EVENT_TYPE_ID', 'x'))).toBe(
      'Тип события с таким идентификатором уже существует.',
    )
  })

  it('SLOT_BUSY → фиксированное сообщение', () => {
    expect(errorMessage(new ApiError(409, 'SLOT_BUSY', 'x'))).toBe(
      'Это время уже занято. Выберите другой слот.',
    )
  })

  it('ApiError без кода → message ошибки', () => {
    expect(errorMessage(new ApiError(500, null, 'boom'))).toBe('boom')
  })

  it('неизвестная ошибка → общее сообщение', () => {
    expect(errorMessage(new Error('x'))).toBe('Что-то пошло не так. Попробуйте ещё раз.')
  })
})

describe('unwrap', () => {
  it('возвращает данные при успехе', async () => {
    const ok = new Response(null, { status: 200 })
    await expect(unwrap(Promise.resolve({ data: [1, 2], response: ok }))).resolves.toEqual([1, 2])
  })

  it('выбрасывает ApiError при ошибке ответа', async () => {
    const bad = new Response(null, { status: 409 })
    const result = Promise.resolve({
      error: { code: 'SLOT_BUSY', message: 'busy' },
      response: bad,
    })
    await expect(unwrap(result)).rejects.toMatchObject({ status: 409, code: 'SLOT_BUSY' })
  })

  it('сетевая ошибка → ApiError со статусом 0', async () => {
    await expect(unwrap(Promise.reject(new TypeError('fetch failed')))).rejects.toMatchObject({
      status: 0,
      code: null,
    })
  })

  it('networkError → сообщение о недоступности', () => {
    expect(errorMessage(networkError())).toContain('Сервер недоступен')
  })
})
