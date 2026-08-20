import { NavLink, Outlet, useNavigate } from 'react-router'

import { useOwnerAuth } from '@/auth/use-owner-session'
import { OwnerLoginDialog } from '@/components/owner-login-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const guestLinks = [{ to: '/', label: 'Записаться' }]

const ownerLinks = [
  { to: '/admin/event-types', label: 'Типы событий' },
  { to: '/admin/schedule', label: 'Расписание' },
  { to: '/admin/bookings', label: 'Брони' },
]

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
          isActive && 'bg-muted text-foreground',
        )
      }
    >
      {label}
    </NavLink>
  )
}

export function Layout() {
  const { isOwner, openLogin, clearOwner } = useOwnerAuth()
  const navigate = useNavigate()

  function handleLogout() {
    clearOwner()
    void navigate('/')
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-base font-semibold">Запись на звонок</span>

          <nav className="flex items-center gap-1">
            {guestLinks.map((link) => (
              <NavItem key={link.to} {...link} />
            ))}
          </nav>

          <button
            type="button"
            onClick={() => (isOwner ? navigate('/admin/event-types') : openLogin())}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            )}
          >
            Админка
          </button>

          {isOwner && (
            <>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Владелец
              </span>
              <nav className="flex items-center gap-1">
                {ownerLinks.map((link) => (
                  <NavItem key={link.to} {...link} />
                ))}
              </nav>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Выйти
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-muted-foreground">
          Время отображается в UTC.
        </div>
      </footer>

      <OwnerLoginDialog />
    </div>
  )
}
