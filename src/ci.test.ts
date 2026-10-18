import { expect, test } from 'vitest'
import ci from '../.github/workflows/ci.yml?raw'

// The text of one top-level job, from its name to the next job (or the end).
function job(name: string): string {
  const start = ci.indexOf(`\n  ${name}:\n`)
  expect(start, `job ${name}`).toBeGreaterThan(-1)
  const rest = ci.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

test('deploy-worker needs check, runs only on pushes to main and deploys with the two secrets', () => {
  const j = job('deploy-worker')
  expect(j).toMatch(/needs: check\n/)
  expect(j).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'")
  expect(j).toContain('wrangler deploy')
  expect(j).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
  expect(j).toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
  expect(j).toMatch(/cancel-in-progress: false/)
})

test('the Pages deploy job needs deploy-worker', () => {
  expect(job('deploy')).toMatch(/needs: \[check, deploy-worker\]/)
})

test('the check job names no Cloudflare secret', () => {
  expect(job('check')).not.toMatch(/CLOUDFLARE|secrets\./)
})
