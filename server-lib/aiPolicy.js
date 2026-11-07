const KB = 1024

// Server-owned policy. Clients choose a task type, never its model, price,
// payload ceiling, tool access, or how many model calls one paid operation
// may contain.
export const AI_TASK_POLICY = Object.freeze({
  brief_translation: {
    billableAction: 'brief_translation',
    creditCost: 10,
    maxCallsPerOperation: 32,
    maxSystemChars: 80 * KB,
    maxMessageChars: 180 * KB,
    maxOutputTokens: 8500,
  },
  kanban_generation: {
    billableAction: 'kanban_generation',
    creditCost: 8,
    maxCallsPerOperation: 3,
    maxSystemChars: 40 * KB,
    maxMessageChars: 100 * KB,
    maxOutputTokens: 4500,
  },
  backlog_generation: {
    billableAction: 'backlog_generation',
    creditCost: 8,
    maxCallsPerOperation: 4,
    maxSystemChars: 50 * KB,
    maxMessageChars: 140 * KB,
    maxOutputTokens: 7000,
  },
  ai_task_prompt: {
    billableAction: 'ai_task_prompt',
    creditCost: 3,
    maxCallsPerOperation: 2,
    maxSystemChars: 35 * KB,
    maxMessageChars: 70 * KB,
    maxOutputTokens: 2500,
  },
  moodboard_refresh: {
    billableAction: 'moodboard_refresh',
    creditCost: 3,
    maxCallsPerOperation: 4,
    maxSystemChars: 35 * KB,
    maxMessageChars: 80 * KB,
    maxOutputTokens: 3500,
    allowWebSearch: true,
  },
  red_flag_analysis: {
    billableAction: 'red_flag_analysis',
    creditCost: 3,
    maxCallsPerOperation: 3,
    maxSystemChars: 35 * KB,
    maxMessageChars: 100 * KB,
    maxOutputTokens: 3500,
  },
  questions_generation: {
    billableAction: 'questions_generation',
    creditCost: 3,
    maxCallsPerOperation: 3,
    maxSystemChars: 35 * KB,
    maxMessageChars: 100 * KB,
    maxOutputTokens: 3500,
  },
  competitors_search: {
    maxCallsPerOperation: 3,
    maxSystemChars: 30 * KB,
    maxMessageChars: 60 * KB,
    maxOutputTokens: 2500,
    allowWebSearch: true,
  },
  inspirations_search: {
    maxCallsPerOperation: 3,
    maxSystemChars: 30 * KB,
    maxMessageChars: 60 * KB,
    maxOutputTokens: 2500,
    allowWebSearch: true,
  },
  enhance_description: {
    maxCallsPerOperation: 1,
    maxSystemChars: 20 * KB,
    maxMessageChars: 40 * KB,
    maxOutputTokens: 600,
  },
  intake_processing: {
    maxCallsPerOperation: 32,
    maxSystemChars: 80 * KB,
    maxMessageChars: 180 * KB,
    maxOutputTokens: 8500,
  },
  chat_refinement: {
    maxCallsPerOperation: 1,
    maxSystemChars: 45 * KB,
    maxMessageChars: 120 * KB,
    maxOutputTokens: 4000,
    allowFunctionTools: true,
  },
  inline_edit: {
    maxCallsPerOperation: 1,
    maxSystemChars: 30 * KB,
    maxMessageChars: 80 * KB,
    maxOutputTokens: 3000,
  },
  brief_chat: {
    maxCallsPerOperation: 1,
    maxSystemChars: 45 * KB,
    maxMessageChars: 120 * KB,
    maxOutputTokens: 2500,
    allowFunctionTools: true,
  },
})

export function getTaskPolicy(taskType) {
  return AI_TASK_POLICY[taskType] || null
}

export function validateAIRequest({
  taskType,
  system = '',
  message,
  messages,
  tools,
  wantsSearch,
  requestedMaxTokens,
}) {
  const policy = getTaskPolicy(taskType)
  if (!policy) return { ok: false, status: 400, code: 'UNKNOWN_TASK', message: 'Unknown task_type.' }
  if (typeof system !== 'string') {
    return { ok: false, status: 400, code: 'INVALID_SYSTEM', message: 'system must be a string.' }
  }
  if (message != null && typeof message !== 'string') {
    return { ok: false, status: 400, code: 'INVALID_MESSAGE', message: 'message must be a string.' }
  }
  if (messages != null && !Array.isArray(messages)) {
    return { ok: false, status: 400, code: 'INVALID_MESSAGES', message: 'messages must be an array.' }
  }

  const systemChars = typeof system === 'string' ? system.length : 0
  const messageChars = typeof message === 'string' ? message.length : JSON.stringify(messages || '').length
  if (systemChars > policy.maxSystemChars || messageChars > policy.maxMessageChars) {
    return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Prompt too large for this task.' }
  }
  if (Array.isArray(messages) && messages.length > 50) {
    return { ok: false, status: 413, code: 'TOO_MANY_MESSAGES', message: 'Too many conversation messages.' }
  }
  if (Array.isArray(tools) && tools.length > 8) {
    return { ok: false, status: 413, code: 'TOO_MANY_TOOLS', message: 'Too many tools in request.' }
  }
  if (Array.isArray(tools) && JSON.stringify(tools).length > 40 * KB) {
    return { ok: false, status: 413, code: 'TOOLS_TOO_LARGE', message: 'Tool definitions are too large.' }
  }
  if (Array.isArray(tools) && tools.length > 0 && !policy.allowFunctionTools) {
    return { ok: false, status: 400, code: 'TOOLS_NOT_ALLOWED', message: 'Tools are not allowed for this task.' }
  }
  if (wantsSearch && !policy.allowWebSearch) {
    return { ok: false, status: 400, code: 'SEARCH_NOT_ALLOWED', message: 'Web search is not allowed for this task.' }
  }

  return {
    ok: true,
    policy,
    maxOutputTokens: Math.max(1, Math.min(Number(requestedMaxTokens) || 2000, policy.maxOutputTokens)),
  }
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
