/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  /** Publishable (anon) key — safe for the browser; RLS protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
