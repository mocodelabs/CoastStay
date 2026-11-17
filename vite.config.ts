import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { securityHeaders } from './deploy/security-headers.ts'

/**
 * Long-lived vendor chunks for code every screen needs (better caching across deploys).
 * Everything else — including Recharts — is split automatically along the lazy route boundaries,
 * so charts only load on the dashboard and reports.
 */
const VENDOR_GROUPS: Array<[string, RegExp]> = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['router', /[\\/]node_modules[\\/](react-router)[\\/]/],
  ['supabase', /[\\/]node_modules[\\/]@supabase[\\/]/],
  ['radix', /[\\/]node_modules[\\/](radix-ui|@radix-ui)[\\/]/],
  ['forms', /[\\/]node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/],
  ['query', /[\\/]node_modules[\\/]@tanstack[\\/]/],
]

/** Origins the browser may talk to for the configured Supabase project (http+ws or https+wss). */
function supabaseOrigins(url: string | undefined): string[] | undefined {
  if (!url) return undefined
  const origin = new URL(url).origin
  return [origin, origin.replace(/^http/, 'ws')]
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5207, strictPort: true },
  // `npm run preview` serves the production build with the production security headers, pointed
  // at whichever Supabase URL the build uses, so CSP problems show up before deploying.
  preview: { port: 5205, headers: securityHeaders(supabaseOrigins(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)) },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [name, re] of VENDOR_GROUPS) if (re.test(id)) return name
          return undefined
        },
      },
    },
  },
}))
