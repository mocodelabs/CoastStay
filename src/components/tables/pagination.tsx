import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PAGE_SIZE = 25

export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const from = (page - 1) * size
  return [from, from + size - 1]
}

export function Pagination({
  page,
  total,
  size = PAGE_SIZE,
  onPage,
}: {
  page: number
  total: number
  size?: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (total <= size) return null
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft /> Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}
