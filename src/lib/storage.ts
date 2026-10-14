import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type Bucket = 'property-photos' | 'receipts' | 'task-photos' | 'maintenance-attachments' | 'branding'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf']

const LIMITS: Record<Bucket, { bytes: number; types: string[] }> = {
  'property-photos': { bytes: 5 * 1024 * 1024, types: IMAGE_TYPES },
  receipts: { bytes: 10 * 1024 * 1024, types: DOC_TYPES },
  'task-photos': { bytes: 8 * 1024 * 1024, types: IMAGE_TYPES },
  'maintenance-attachments': { bytes: 10 * 1024 * 1024, types: DOC_TYPES },
  branding: { bytes: 2 * 1024 * 1024, types: [...IMAGE_TYPES, 'image/svg+xml'] },
}

export function validateFile(bucket: Bucket, file: File): string | null {
  const limit = LIMITS[bucket]
  if (!limit.types.includes(file.type)) {
    return limit.types.includes('application/pdf') ? 'Use a JPG, PNG, WebP or PDF file.' : 'Use a JPG, PNG or WebP image.'
  }
  if (file.size > limit.bytes) return `Files must be ${Math.round(limit.bytes / 1024 / 1024)} MB or smaller.`
  return null
}

/** Uploads to `<org>/<entity>/<random>.<ext>` and returns the storage path. */
export async function uploadFile(bucket: Bucket, orgId: string, entityId: string, file: File): Promise<string> {
  const problem = validateFile(bucket, file)
  if (problem) throw new Error(problem)
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const path = `${orgId}/${entityId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function removeFile(bucket: Bucket, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

/** Short-lived signed URLs for private files, keyed by path. */
export function useSignedUrls(bucket: Bucket, paths: string[]) {
  const sorted = [...paths].sort()
  return useQuery({
    queryKey: ['signed-urls', bucket, sorted],
    enabled: sorted.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(sorted, 60 * 60)
      if (error) throw error
      const map: Record<string, string> = {}
      for (const d of data) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
      return map
    },
  })
}

export async function openSignedFile(bucket: Bucket, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}
