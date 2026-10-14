import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, allowOrgCreation, createOrg, createProperty, createUser, type TestUser } from './fixtures'

// 1×1 transparent PNG
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
)
const png = () => new Blob([PNG], { type: 'image/png' })

let ownerA: TestUser
let ownerB: TestUser
let orgA: string
let propertyA: string

beforeAll(async () => {
  await allowOrgCreation(true)
  ownerA = await createUser('st-owner-a')
  ownerB = await createUser('st-owner-b')
  orgA = await createOrg(ownerA, 'Tiwi Cottages')
  await createOrg(ownerB, 'Shimoni Stays')
  propertyA = (await createProperty(ownerA.client, orgA)).property.id
})

afterAll(() => allowOrgCreation(false))

describe('storage policies', () => {
  it('keeps property photos private to the organization', async () => {
    const path = `${orgA}/${propertyA}/front.png`
    const up = await ownerA.client.storage.from('property-photos').upload(path, png(), { contentType: 'image/png' })
    expect(up.error).toBeNull()

    const own = await ownerA.client.storage.from('property-photos').createSignedUrl(path, 60)
    expect(own.error).toBeNull()

    const foreign = await ownerB.client.storage.from('property-photos').createSignedUrl(path, 60)
    expect(foreign.error).not.toBeNull()
    const foreignDownload = await ownerB.client.storage.from('property-photos').download(path)
    expect(foreignDownload.error).not.toBeNull()
  })

  it('stops other organizations and caretakers from writing property photos', async () => {
    const intruder = await ownerB.client.storage
      .from('property-photos')
      .upload(`${orgA}/${propertyA}/intruder.png`, png(), { contentType: 'image/png' })
    expect(intruder.error).not.toBeNull()

    const hk = await addMember(ownerA, orgA, 'housekeeping', { propertyIds: [propertyA] })
    const hkUpload = await hk.client.storage
      .from('property-photos')
      .upload(`${orgA}/${propertyA}/hk.png`, png(), { contentType: 'image/png' })
    expect(hkUpload.error).not.toBeNull()
  })

  it('rejects files with disallowed types', async () => {
    const r = await ownerA.client.storage
      .from('property-photos')
      .upload(`${orgA}/${propertyA}/script.html`, new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), {
        contentType: 'text/html',
      })
    expect(r.error).not.toBeNull()
  })

  it('restricts receipts to finance roles', async () => {
    const manager = await addMember(ownerA, orgA, 'manager', { propertyIds: [propertyA] })
    const r = await manager.client.storage
      .from('receipts')
      .upload(`${orgA}/${crypto.randomUUID()}/r.png`, png(), { contentType: 'image/png' })
    expect(r.error).not.toBeNull()
    const ok = await ownerA.client.storage
      .from('receipts')
      .upload(`${orgA}/${crypto.randomUUID()}/r.png`, png(), { contentType: 'image/png' })
    expect(ok.error).toBeNull()
  })
})
