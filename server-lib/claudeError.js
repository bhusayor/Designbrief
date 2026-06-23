// ────────────────────────────────────────────────────────────────────
// mapClaudeError, turn an Anthropic SDK exception (or any thrown
// error from a Claude proxy) into a user-safe { status, body } response.
//
// Goals:
//   - Never leak the AI provider's identity to end users.
//   - Never leak words like "API key", "credit balance", or any
//     console URL.
//   - Use HTTP semantics the client can branch on (429 retry-after,
//     503 high demand, 504 timeout, etc.).
//   - Keep the real error logged server-side so we can debug.
//
// Use:
//   try { ... } catch (e) {
//     const { status, body } = mapClaudeError(e, '[claude]')
//     return res.status(status).json(body)
//   }
// ────────────────────────────────────────────────────────────────────

const LOW_BALANCE_RX = /credit balance is too low|insufficient.*credit|billing/i

export function mapClaudeError(error, tag = '[ai]') {
  // Log the raw error for our own debugging, NEVER returned to the user.
  try {
    console.error(tag, 'AI proxy error:', {
      message: error?.message,
      status: error?.status,
      type: error?.constructor?.name,
      anthropic: error?.error || null,
    })
  } catch {}

  const raw = String(error?.message || '') + ' ' +
    String(error?.error?.error?.message || error?.error?.message || '')

  // Out of credits / billing issue, Anthropic returns 400 with a
  // specific message. Surface as 503 high demand so the user just
  // tries again later (and never sees billing language).
  if (error?.status === 402 || LOW_BALANCE_RX.test(raw)) {
    return {
      status: 503,
      body: {
        error: 'high_demand',
        message: 'Our AI is currently at capacity. Please try again in a few minutes.',
      },
    }
  }

  // Invalid API key (401). Never expose this.
  if (error?.status === 401) {
    return {
      status: 503,
      body: {
        error: 'service_unavailable',
        message: 'AI features are temporarily unavailable. Try again shortly.',
      },
    }
  }

  // Rate limited (429), pass through with a retry hint.
  if (error?.status === 429) {
    return {
      status: 429,
      body: {
        error: 'rate_limited',
        message: "You're moving fast! Our AI needs a moment to catch up. Try again in 30 seconds.",
        retry_after: 30,
      },
    }
  }

  // Overloaded (529 from Anthropic).
  if (error?.status === 529) {
    return {
      status: 503,
      body: {
        error: 'high_demand',
        message: "More designers than usual are using DesignBrief AI right now. You're in good hands, try again shortly.",
      },
    }
  }

  // Timeout, both abort and ETIMEDOUT show up here.
  if (
    error?.name === 'AbortError' ||
    error?.code === 'ETIMEDOUT' ||
    /timeout|timed out/i.test(raw)
  ) {
    return {
      status: 504,
      body: {
        error: 'timeout',
        message: 'This brief is taking longer than expected. Try breaking it into smaller sections.',
      },
    }
  }

  // Generic fallback. Never expose the actual error.
  return {
    status: 500,
    body: {
      error: 'unexpected',
      message: 'Something interrupted the AI. Your work is safe, please try again.',
    },
  }
}

// Convenience: same idea but for streaming endpoints where we've
// already started sending SSE and want to write an error frame.
export function streamErrorFrame(error, tag = '[ai-stream]') {
  const { body } = mapClaudeError(error, tag)
  return body
}

// For Anthropic HTTP responses that aren't OK, turn the body into an
// SDK-shaped error before mapping.
export function mapHttpAnthropicError(status, bodyText, tag = '[ai]') {
  let parsed = null
  try { parsed = JSON.parse(bodyText) } catch {}
  const fakeErr = { status, message: parsed?.error?.message || bodyText, error: parsed }
  return mapClaudeError(fakeErr, tag)
}
