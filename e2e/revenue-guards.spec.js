import { expect, test } from '@playwright/test'

const apiBase = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:3001'

test('logged-out users land on authentication', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('AI endpoint rejects unauthenticated spend', async ({ request }) => {
  const response = await request.post(`${apiBase}/api/ai`, {
    data: {
      task_type: 'brief_translation',
      operation_id: '4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36',
      message: 'Translate this brief.',
    },
  })
  expect(response.status()).toBe(401)
})

test('Codex builder rejects unauthenticated agent spend', async ({ request }) => {
  const response = await request.post(`${apiBase}/api/build-component`, {
    data: { prompt: 'Build a landing-page hero.' },
  })
  expect(response.status()).toBe(401)
})

test('authenticated callers cannot turn the AI route into a generic proxy', async ({ request }) => {
  test.skip(!process.env.E2E_ACCESS_TOKEN, 'Set E2E_ACCESS_TOKEN for authenticated API checks.')
  const response = await request.post(`${apiBase}/api/ai`, {
    headers: { Authorization: `Bearer ${process.env.E2E_ACCESS_TOKEN}` },
    data: { task_type: 'arbitrary_task', message: 'Run an arbitrary model.' },
  })
  expect(response.status()).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'UNKNOWN_TASK' })
})

test('a zero-credit account is stopped before an OpenAI request', async ({ request }) => {
  test.skip(!process.env.E2E_ZERO_CREDIT_ACCESS_TOKEN, 'Set a seeded zero-credit user token for billing checks.')
  const response = await request.post(`${apiBase}/api/ai`, {
    headers: { Authorization: `Bearer ${process.env.E2E_ZERO_CREDIT_ACCESS_TOKEN}` },
    data: {
      task_type: 'brief_translation',
      operation_id: crypto.randomUUID(),
      message: 'A short product brief.',
    },
  })
  expect(response.status()).toBe(402)
  await expect(response.json()).resolves.toMatchObject({ error: 'insufficient_credits' })
})
