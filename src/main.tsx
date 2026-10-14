import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'
import { supabaseConfigured } from '@/lib/supabase'
import './index.css'

function MissingConfig() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 32, maxWidth: 560 }}>
      <h1>CoastStay is not configured</h1>
      <p>
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> were not set when this app was built.
      </p>
      <p>
        <strong>Hosted (Vercel, Netlify…):</strong> add them in the project’s environment variables, then redeploy — the
        values are built into the app, so a new build is required. See <code>docs/DEPLOYMENT.md</code> §6.
      </p>
      <p>
        <strong>Local:</strong> put them in <code>.env.local</code> (see <code>.env.example</code>) and restart the dev
        server.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? (
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
)
