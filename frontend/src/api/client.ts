import createClient from 'openapi-fetch'

import type { paths } from './schema'

/**
 * Единственная точка доступа к API бэкенда.
 * Базовый URL задаётся переменной окружения VITE_API_BASE_URL;
 * по умолчанию — '/api' (dev-прокси Vite на http://localhost:8080).
 */
export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const api = createClient<paths>({ baseUrl: apiBaseUrl })
