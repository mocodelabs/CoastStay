import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as React from 'react'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/auth-provider'
import { WorkspaceProvider } from '@/features/workspace/workspace-provider'

function shouldRetry(failureCount: number, error: unknown): boolean {
  const code = (error as { code?: string; status?: number } | null)?.code
  // Don't retry authorization or validation failures.
  if (code && /^(42501|PGRST|23|22|P0)/.test(code)) return false
  return failureCount < 2
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
    mutationCache: new MutationCache(),
  })
}

const queryClient = createQueryClient()

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </AuthProvider>
      <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
    </QueryClientProvider>
  )
}
