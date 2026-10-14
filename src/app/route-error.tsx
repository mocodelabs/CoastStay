import { Compass, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { EmptyState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or may have moved."
      action={
        <Button asChild variant="outline">
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
    />
  )
}

/** Last-resort boundary for render errors and failed lazy chunks (e.g. after a deployment). */
export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-24">
        <NotFound />
      </div>
    )
  }
  const chunkFailed = error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message)
  if (import.meta.env.DEV) console.error(error)
  return (
    <div className="mx-auto max-w-lg p-6 pt-24">
      <EmptyState
        icon={TriangleAlert}
        title={chunkFailed ? 'CoastStay was updated' : 'Something went wrong'}
        description={
          chunkFailed ? 'Reload the page to get the latest version.' : 'An unexpected error occurred. Reloading usually fixes it.'
        }
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  )
}
