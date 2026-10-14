import { rmSync } from 'node:fs'
import { cleanup } from '../integration/global-setup'

export default async function globalTeardown() {
  if (process.env.KEEP_TEST_DATA) return
  await cleanup()
  rmSync('tests/e2e/.auth', { recursive: true, force: true })
}
