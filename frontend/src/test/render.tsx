import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

/** Рендерит компонент в провайдерах React Query и React Router (без реального API). */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

export type QueryOverrides = {
  data?: unknown
  error?: unknown
  isPending?: boolean
  isError?: boolean
}

/** Значение-заглушка для useQuery. */
export function queryResult({ data, error, isPending = false, isError = false }: QueryOverrides = {}) {
  return {
    data,
    error,
    isPending,
    isError,
    isLoading: isPending,
    isLoadingError: isError,
    isSuccess: !isPending && !isError,
    isFetched: !isPending,
    refetch: () => Promise.resolve(),
    status: isPending ? 'pending' : isError ? 'error' : 'success',
  }
}
