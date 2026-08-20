import { useEffect } from 'react'

import { isUnauthorized } from '@/api/errors'
import { useOwnerAuth } from './use-owner-session'

/**
 * При ошибке 401 (сессия владельца недействительна) сбрасывает локальный
 * признак владельца и открывает диалог повторного входа.
 */
export function useHandleUnauthorized(error: unknown, isError: boolean) {
  const { clearOwner, openLogin } = useOwnerAuth()
  useEffect(() => {
    if (isError && isUnauthorized(error)) {
      clearOwner()
      openLogin()
    }
  }, [isError, error, clearOwner, openLogin])
}
