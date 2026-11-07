import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI_TASK_POLICY, isUuid, validateAIRequest } from '../aiPolicy.js'
import { consumeCreditOperation, requireProPlan } from '../authMiddleware.js'
import { CREDIT_COSTS } from '../../src/lib/credits.js'
import { AGENT_TASKS, MODEL_FOR } from '../../src/lib/models.js'

function responseSpy() {
  return {
    status: vi.fn(function status() { return this }),
    json: vi.fn(function json() { return this }),
  }
}

describe('AI request policy', () => {
  it('rejects unknown task types before model execution', () => {
    expect(validateAIRequest({ taskType: 'arbitrary_model_proxy', message: 'hello' })).toMatchObject({
      ok: false,
      status: 400,
      code: 'UNKNOWN_TASK',
    })
  })

  it('clamps output tokens to the server-owned task ceiling', () => {
    const result = validateAIRequest({
      taskType: 'brief_translation',
      message: 'brief',
      requestedMaxTokens: 999999,
    })
    expect(result.ok).toBe(true)
    expect(result.maxOutputTokens).toBe(AI_TASK_POLICY.brief_translation.maxOutputTokens)
  })

  it('rejects oversized prompts and disallowed tools/search', () => {
    const max = AI_TASK_POLICY.inline_edit.maxMessageChars
    expect(validateAIRequest({ taskType: 'inline_edit', message: 'x'.repeat(max + 1) }).code)
      .toBe('PAYLOAD_TOO_LARGE')
    expect(validateAIRequest({ taskType: 'inline_edit', message: 'x', tools: [{ name: 'run' }] }).code)
      .toBe('TOOLS_NOT_ALLOWED')
    expect(validateAIRequest({ taskType: 'inline_edit', message: 'x', wantsSearch: true }).code)
      .toBe('SEARCH_NOT_ALLOWED')
  })

  it('rejects malformed messages and excessive tool definitions', () => {
    expect(validateAIRequest({ taskType: 'inline_edit', message: { prompt: 'x' }, system: '' }).code)
      .toBe('INVALID_MESSAGE')
    expect(validateAIRequest({ taskType: 'brief_chat', message: 'x', system: '', tools: Array.from({ length: 9 }, (_, i) => ({ name: `t${i}` })) }).code)
      .toBe('TOO_MANY_TOOLS')
  })

  it('accepts RFC-compatible operation UUIDs only', () => {
    expect(isUuid('4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36')).toBe(true)
    expect(isUuid('client-controlled-operation')).toBe(false)
  })

  it('keeps server prices aligned with display prices', () => {
    for (const policy of Object.values(AI_TASK_POLICY)) {
      if (!policy.billableAction) continue
      expect(policy.creditCost).toBe(CREDIT_COSTS[policy.billableAction])
    }
  })

  it('defines a direct-response policy for every non-agent model task', () => {
    const responseTasks = Object.keys(MODEL_FOR).filter(task => !AGENT_TASKS.has(task)).sort()
    expect(Object.keys(AI_TASK_POLICY).sort()).toEqual(responseTasks)
  })

  it('keeps database operation costs and call budgets aligned with server policy', () => {
    const migration = readFileSync(new URL('../../migrations/0013_server_ai_credit_operations.sql', import.meta.url), 'utf8')
    for (const policy of Object.values(AI_TASK_POLICY)) {
      if (!policy.billableAction) continue
      const escaped = policy.billableAction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const row = new RegExp(`\\('${escaped}'\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\)`).exec(migration)
      expect(row, `missing SQL price row for ${policy.billableAction}`).not.toBeNull()
      expect(Number(row[1])).toBe(policy.creditCost)
      expect(Number(row[2])).toBe(policy.maxCallsPerOperation)
    }
    expect(migration).not.toMatch(/plan\s*,\s*'free'\)\s*<>\s*'free'/)
  })
})

describe('server credit operation enforcement', () => {
  it('charges through the service-role RPC and returns its balance', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ ok: true, charged: true, credits_remaining: 40, calls_remaining: 31 }],
        error: null,
      }),
    }
    const res = responseSpy()
    const result = await consumeCreditOperation(
      supabase,
      'user-id',
      '4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36',
      AI_TASK_POLICY.brief_translation,
      res,
    )
    expect(result).toMatchObject({ ok: true, charged: true, credits_remaining: 40 })
    expect(supabase.rpc).toHaveBeenCalledWith('consume_ai_credit_operation', {
      p_user_id: 'user-id',
      p_operation_id: '4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36',
      p_action: 'brief_translation',
    })
    expect(res.status).not.toHaveBeenCalled()
  })

  it('fails closed when credit verification is unavailable', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('offline') }) }
    const res = responseSpy()
    const result = await consumeCreditOperation(
      supabase,
      'user-id',
      '4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36',
      AI_TASK_POLICY.brief_translation,
      res,
    )
    expect(result).toBeNull()
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('returns payment-required for an insufficient balance', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ ok: false, reason: 'insufficient_credits', credits_remaining: 2 }],
        error: null,
      }),
    }
    const res = responseSpy()
    await consumeCreditOperation(
      supabase,
      'user-id',
      '4d9d7ea0-6c09-4e68-9358-86ebf6ee4c36',
      AI_TASK_POLICY.brief_translation,
      res,
    )
    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'insufficient_credits' }))
  })
})

describe('builder plan enforcement', () => {
  function profileClient(result) {
    const single = vi.fn().mockResolvedValue(result)
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    return { client: { from }, from, select, eq, single }
  }

  it('allows Pro accounts to run managed builder agents', async () => {
    const { client, from } = profileClient({ data: { plan: 'pro' }, error: null })
    const res = responseSpy()
    await expect(requireProPlan(client, 'user-id', res)).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith('profiles')
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects Free and Starter accounts before agent spend', async () => {
    for (const plan of ['free', 'starter']) {
      const { client } = profileClient({ data: { plan }, error: null })
      const res = responseSpy()
      await expect(requireProPlan(client, 'user-id', res)).resolves.toBe(false)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PRO_PLAN_REQUIRED',
      }))
    }
  })

  it('fails closed when the plan cannot be verified', async () => {
    const { client } = profileClient({ data: null, error: new Error('offline') })
    const res = responseSpy()
    await expect(requireProPlan(client, 'user-id', res)).resolves.toBe(false)
    expect(res.status).toHaveBeenCalledWith(503)
  })
})
