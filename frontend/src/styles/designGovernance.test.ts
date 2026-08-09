import manifest from '../../../docs/02_Architecture/design-system/reference/manifest.json'

it('fixa a versão e os hashes aprovados', () => {
  expect(manifest.version).toBe('1.0.0')
  expect(manifest.assets.redesign.sha256).toMatch(/^[A-F0-9]{64}$/)
  expect(manifest.assets.logoBlue.sha256).toBe('8DF077FA7F5F87D51C9F0A940F5AE6B670B555A41EB51EA1DE0F90BE1AEA59C2')
})