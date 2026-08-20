import { useContext } from 'react'

import { OwnerAuthContext, type OwnerAuthValue } from './owner-session'

export function useOwnerAuth(): OwnerAuthValue {
  const ctx = useContext(OwnerAuthContext)
  if (!ctx) {
    throw new Error('useOwnerAuth must be used within OwnerAuthProvider')
  }
  return ctx
}
