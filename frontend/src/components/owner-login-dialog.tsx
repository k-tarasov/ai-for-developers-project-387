import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage } from '@/api/errors'
import { queryKeys, useLoginOwner } from '@/api/queries'
import { useOwnerAuth } from '@/auth/use-owner-session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OwnerLoginDialog() {
  const { loginOpen, closeLogin, setOwner } = useOwnerAuth()
  const login = useLoginOwner()
  const queryClient = useQueryClient()
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    login.mutate(
      { login: loginValue, password },
      {
        onSuccess: () => {
          setOwner()
          setLoginValue('')
          setPassword('')
          closeLogin()
          void queryClient.invalidateQueries({ queryKey: queryKeys.eventTypes })
          void queryClient.invalidateQueries({ queryKey: queryKeys.schedule })
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookings })
        },
      },
    )
  }

  return (
    <Dialog
      open={loginOpen}
      onOpenChange={(open) => {
        if (!open) closeLogin()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Вход для владельца</DialogTitle>
          <DialogDescription>
            Введите логин и пароль, заданные при старте сервера.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {login.error && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось войти</AlertTitle>
              <AlertDescription>{errorMessage(login.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="owner-login">Логин</Label>
            <Input
              id="owner-login"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-password">Пароль</Label>
            <Input
              id="owner-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Входим…' : 'Войти'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
