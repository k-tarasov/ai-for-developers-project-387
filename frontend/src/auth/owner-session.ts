import { createContext } from 'react'

const OWNER_ACTIVE_KEY = 'owner_session_active'

interface OwnerAuthValue {
  isOwner: boolean
  loginOpen: boolean
  setOwner: () => void
  clearOwner: () => void
  openLogin: () => void
  closeLogin: () => void
}

const OwnerAuthContext = createContext<OwnerAuthValue | null>(null)

function loadIsOwner(): boolean {
  try {
    return localStorage.getItem(OWNER_ACTIVE_KEY) === 'true'
  } catch {
    return false
  }
}

export { OwnerAuthContext, OWNER_ACTIVE_KEY, loadIsOwner }
export type { OwnerAuthValue }
