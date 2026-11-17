// Renders docs/brochure/coaststay-brochure.html to an A4 PDF with Playwright's Chromium.
//   npm run brochure:pdf
// The HTML is written without <html>/<head>/<body> (it is also published as a web page), so it is
// wrapped in a document skeleton here. Fonts load from Google Fonts, so this needs internet access.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const SRC = fileURLToPath(new URL('../docs/brochure/coaststay-brochure.html', import.meta.url))
const OUT = fileURLToPath(new URL('../docs/brochure/CoastStay-Brochure.pdf', import.meta.url))

const body = readFileSync(SRC, 'utf8')
const html = `<!doctype html><html lang="en-KE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 1400 } })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true })
  if (process.argv.includes('--preview')) {
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.emulateMedia({ media: 'print', colorScheme: 'light' })
    await page.screenshot({ path: fileURLToPath(new URL('../test-results/brochure-print.png', import.meta.url)), fullPage: true })
  }
} finally {
  await browser.close()
}
const pages = (readFileSync(OUT, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
console.log(`Wrote docs/brochure/CoastStay-Brochure.pdf (${pages} pages)`)
