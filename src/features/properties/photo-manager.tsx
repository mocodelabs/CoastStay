import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { toUserMessage } from '@/lib/errors'
import { useSignedUrls, validateFile } from '@/lib/storage'
import { useDeletePhoto, useReorderPhotos, useUpdatePhotoCaption, useUploadPhotos, type PropertyPhoto } from './api'

export function PhotoManager({ propertyId, photos, editable }: { propertyId: string; photos: PropertyPhoto[]; editable: boolean }) {
  const urls = useSignedUrls('property-photos', photos.map((p) => p.storage_path))
  const upload = useUploadPhotos(propertyId)
  const reorder = useReorderPhotos(propertyId)
  const remove = useDeletePhoto(propertyId)
  const caption = useUpdatePhotoCaption(propertyId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<PropertyPhoto | null>(null)

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    const invalid = files.map((f) => [f, validateFile('property-photos', f)] as const).filter(([, err]) => err)
    invalid.forEach(([f, err]) => toast.error(`${f.name}: ${err}`))
    const valid = files.filter((f) => !validateFile('property-photos', f))
    if (!valid.length) return
    upload.mutate(
      { files: valid, startOrder: photos.length },
      {
        onSuccess: (failures) => {
          failures.forEach((f) => toast.error(f))
          const ok = valid.length - failures.length
          if (ok) toast.success(`${ok} photo${ok === 1 ? '' : 's'} uploaded.`)
        },
        onError: (err) => toast.error(toUserMessage(err)),
      },
    )
  }

  function move(index: number, delta: number) {
    const ids = photos.map((p) => p.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    reorder.mutate(ids, { onError: (err) => toast.error(toUserMessage(err)) })
  }

  function makeCover(index: number) {
    const ids = photos.map((p) => p.id)
    const [id] = ids.splice(index, 1)
    reorder.mutate([id!, ...ids], {
      onSuccess: () => toast.success('Cover photo updated.'),
      onError: (err) => toast.error(toUserMessage(err)),
    })
  }

  return (
    <div className="space-y-3">
      {photos.length === 0 && !editable && <p className="text-sm text-muted-foreground">No photos yet.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => {
          const url = urls.data?.[photo.storage_path]
          return (
            <li key={photo.id} className="overflow-hidden rounded-lg border bg-surface">
              <div className="relative aspect-[4/3] bg-sand-100">
                {url ? (
                  <img src={url} alt={photo.caption ?? `Photo ${i + 1}`} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Skeleton className="size-full rounded-none" />
                )}
                {i === 0 && (
                  <Badge tone="ocean" className="absolute top-2 left-2">
                    Cover
                  </Badge>
                )}
              </div>
              {editable && (
                <div className="space-y-2 p-2">
                  <Input
                    defaultValue={photo.caption ?? ''}
                    placeholder="Caption"
                    aria-label={`Caption for photo ${i + 1}`}
                    maxLength={200}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      if (e.target.value !== (photo.caption ?? '')) {
                        caption.mutate({ id: photo.id, caption: e.target.value }, { onError: (err) => toast.error(toUserMessage(err)) })
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                        <ArrowLeft />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move later"
                        disabled={i === photos.length - 1 || reorder.isPending}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowRight />
                      </Button>
                      {i > 0 && (
                        <Button variant="ghost" size="icon-sm" aria-label="Make cover photo" disabled={reorder.isPending} onClick={() => makeCover(i)}>
                          <Star />
                        </Button>
                      )}
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete photo" onClick={() => setDeleting(photo)}>
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {editable && (
          <li>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <ImagePlus className="size-6" aria-hidden />
              {upload.isPending ? 'Uploading…' : 'Add photos'}
            </button>
          </li>
        )}
      </ul>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onFiles} />
      {editable && <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB each. The first photo is the cover.</p>}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this photo?"
        description="The photo is removed permanently."
        confirmLabel="Delete photo"
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(deleting!)
            toast.success('Photo deleted.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </div>
  )
}
