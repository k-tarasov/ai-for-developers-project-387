import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { OwnerAuthProvider } from '@/auth/owner-session-provider'
import { router } from '@/app/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OwnerAuthProvider>
        <RouterProvider router={router} />
      </OwnerAuthProvider>
    </QueryClientProvider>
  )
}
