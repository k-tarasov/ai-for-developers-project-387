import { createBrowserRouter } from 'react-router'

import { Layout } from '@/app/layout'
import { AdminBookingsPage } from '@/pages/admin-bookings-page'
import { AdminEventTypesPage } from '@/pages/admin-event-types-page'
import { AdminSchedulePage } from '@/pages/admin-schedule-page'
import { BookPage } from '@/pages/book-page'
import { EventTypesPage } from '@/pages/event-types-page'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <EventTypesPage /> },
      { path: '/book/:eventTypeId', element: <BookPage /> },
      { path: '/admin/event-types', element: <AdminEventTypesPage /> },
      { path: '/admin/schedule', element: <AdminSchedulePage /> },
      { path: '/admin/bookings', element: <AdminBookingsPage /> },
    ],
  },
])
