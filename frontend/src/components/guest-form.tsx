import { useState, type FormEvent } from 'react'

import { ApiError, errorMessage } from '@/api/errors'
import { useCreateGuest } from '@/api/queries'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function GuestForm({ onCreated }: { onCreated?: () => void }) {
  const createGuest = useCreateGuest()
  const [name, setName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || (!guestPhone.trim() && !guestEmail.trim())) {
      setContactError('Укажите имя и хотя бы один контакт: телефон или email.')
      return
    }
    setContactError(null)
    createGuest.mutate(
      {
        name: name.trim(),
        // Пустые строки не отправляем: бэкенд валидирует формат email и отвечает 400.
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
        rememberMe,
      },
      { onSuccess: () => onCreated?.() },
    )
  }

  const showServerError =
    createGuest.error instanceof ApiError && createGuest.error.code !== 'CONTACT_REQUIRED'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ваши данные</CardTitle>
        <CardDescription>
          Оставьте контакты, чтобы мы узнали вас при следующей записи.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {contactError && (
            <Alert variant="destructive">
              <AlertTitle>Проверьте данные</AlertTitle>
              <AlertDescription>{contactError}</AlertDescription>
            </Alert>
          )}
          {showServerError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось сохранить</AlertTitle>
              <AlertDescription>{errorMessage(createGuest.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="guest-form-name">Имя</Label>
            <Input
              id="guest-form-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-form-phone">Телефон</Label>
            <Input
              id="guest-form-phone"
              type="tel"
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-form-email">Email</Label>
            <Input
              id="guest-form-email"
              type="email"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Запомнить на 30 дней
          </label>
          <Button type="submit" disabled={createGuest.isPending}>
            {createGuest.isPending ? 'Сохраняем…' : 'Продолжить'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
