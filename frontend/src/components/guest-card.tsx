import { useState, type FormEvent } from 'react'

import { errorMessage } from '@/api/errors'
import { useUpdateGuest, type GuestProfile } from '@/api/queries'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function GuestCard({ profile }: { profile: GuestProfile }) {
  const updateGuest = useUpdateGuest()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.name)
  const [guestPhone, setGuestPhone] = useState(profile.guestPhone ?? '')
  const [guestEmail, setGuestEmail] = useState(profile.guestEmail ?? '')

  function startEdit() {
    setName(profile.name)
    setGuestPhone(profile.guestPhone ?? '')
    setGuestEmail(profile.guestEmail ?? '')
    setEditing(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    updateGuest.mutate(
      {
        id: profile.id,
        name: name.trim(),
        // Пустые строки не отправляем: бэкенд валидирует формат email и отвечает 400.
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ваши данные</CardTitle>
        <CardDescription>Вы записаны как знакомый гость.</CardDescription>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            {updateGuest.error && (
              <Alert variant="destructive">
                <AlertTitle>Не удалось сохранить</AlertTitle>
                <AlertDescription>{errorMessage(updateGuest.error)}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="guest-name">Имя</Label>
              <Input
                id="guest-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Телефон</Label>
              <Input
                id="guest-phone"
                type="tel"
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={updateGuest.isPending}>
                Сохранить
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Имя: </span>
              {profile.name}
            </p>
            {profile.guestPhone && (
              <p>
                <span className="text-muted-foreground">Телефон: </span>
                {profile.guestPhone}
              </p>
            )}
            {profile.guestEmail && (
              <p>
                <span className="text-muted-foreground">Email: </span>
                {profile.guestEmail}
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-2" onClick={startEdit}>
              Изменить
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
