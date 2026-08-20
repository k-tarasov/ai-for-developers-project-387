import { useCallback, useState, type ReactNode } from 'react'

import { OWNER_ACTIVE_KEY, OwnerAuthContext, loadIsOwner } from './owner-session'

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const [isOwner, setIsOwner] = useState(loadIsOwner)
  const [loginOpen, setLoginOpen] = useState(false)

  const setOwner = useCallback(() => {
    try {
      localStorage.setItem(OWNER_ACTIVE_KEY, 'true')
    } catch {
      // игнорируем недоступность хранилища
    }
    setIsOwner(true)
  }, [])

  const clearOwner = useCallback(() => {
    try {
      localStorage.removeItem(OWNER_ACTIVE_KEY)
    } catch {
      // игнорируем недоступность хранилища
    }
    setIsOwner(false)
  }, [])

  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  return (
    <OwnerAuthContext.Provider
      value={{ isOwner, loginOpen, setOwner, clearOwner, openLogin, closeLogin }}
    >
      {children}
    </OwnerAuthContext.Provider>
  )
}
