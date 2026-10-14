// Writes vercel.json and public/_headers from deploy/security-headers.ts.
// Run with `npm run hosting:config` after changing the headers module.
import { writeFileSync } from 'node:fs'
import { headersFile, vercelConfig } from '../deploy/security-headers.ts'

const root = new URL('../', import.meta.url)
writeFileSync(new URL('vercel.json', root), JSON.stringify(vercelConfig(), null, 2) + '\n')
writeFileSync(new URL('public/_headers', root), headersFile())
console.log('Wrote vercel.json and public/_headers')
