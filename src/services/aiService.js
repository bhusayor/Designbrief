/**
 * AI Service - Handles all API calls to Claude
 * Uses streaming so results appear word-by-word instantly
 */

// In production (Vercel), API calls go to the same domain via relative URLs.
// In local dev, Vite proxies /api → localhost:3001 (see vite.config.js).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const PRICING = {
  INPUT_PER_1M_TOKENS: 3,
  OUTPUT_PER_1M_TOKENS: 15,
  BUDGET_CENTS: 500,
};

const RATE_LIMITS = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_REQUESTS_PER_HOUR: 100,
};

class UsageTracker {
  constructor() {
    this.loadUsage();
    this.requestTimestamps = [];
  }

  loadUsage() {
    const stored = localStorage.getItem('aiServiceUsage');
    if (stored) {
      this.usage = JSON.parse(stored);
    } else {
      this.usage = {
        totalTokensInput: 0,
        totalTokensOutput: 0,
        totalCostCents: 0,
        requestCount: 0,
        lastReset: Date.now(),
      };
      this.saveUsage();
    }
  }

  saveUsage() {
    localStorage.setItem('aiServiceUsage', JSON.stringify(this.usage));
  }

  estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
  }

  calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1_000_000) * PRICING.INPUT_PER_1M_TOKENS * 100;
    const outputCost = (outputTokens / 1_000_000) * PRICING.OUTPUT_PER_1M_TOKENS * 100;
    return Math.ceil(inputCost + outputCost);
  }

  addRequest(inputText, outputText) {
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);
    const costCents = this.calculateCost(inputTokens, outputTokens);
    this.usage.totalTokensInput += inputTokens;
    this.usage.totalTokensOutput += outputTokens;
    this.usage.totalCostCents += costCents;
    this.usage.requestCount += 1;
    this.saveUsage();
    return { inputTokens, outputTokens, costCents };
  }

  getRemainingBudget() {
    return PRICING.BUDGET_CENTS - this.usage.totalCostCents;
  }

  getUsagePercentage() {
    return (this.usage.totalCostCents / PRICING.BUDGET_CENTS) * 100;
  }

  exceedsRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneHourAgo);
    const recentMin = this.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
    const recentHour = this.requestTimestamps.length;
    if (recentMin >= RATE_LIMITS.MAX_REQUESTS_PER_MINUTE) {
      throw new Error(`Rate limit exceeded: Max ${RATE_LIMITS.MAX_REQUESTS_PER_MINUTE} requests per minute`);
    }
    if (recentHour >= RATE_LIMITS.MAX_REQUESTS_PER_HOUR) {
      throw new Error(`Rate limit exceeded: Max ${RATE_LIMITS.MAX_REQUESTS_PER_HOUR} requests per hour`);
    }
    this.requestTimestamps.push(now);
  }

  checkBudget() {
    if (this.getRemainingBudget() <= 0) {
      throw new Error('Budget exceeded: $5.00 credit limit reached');
    }
  }

  getStats() {
    return {
      totalCostDollars: (this.usage.totalCostCents / 100).toFixed(2),
      remainingDollars: (this.getRemainingBudget() / 100).toFixed(2),
      usagePercentage: this.getUsagePercentage().toFixed(1),
      totalRequests: this.usage.requestCount,
      totalTokensInput: this.usage.totalTokensInput,
      totalTokensOutput: this.usage.totalTokensOutput,
    };
  }

  reset() {
    this.usage = {
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalCostCents: 0,
      requestCount: 0,
      lastReset: Date.now(),
    };
    this.saveUsage();
  }
}

const tracker = new UsageTracker();

// ── Streaming helper ──────────────────────────────────────────────────────────
// onChunk(newText, fullTextSoFar), called as each piece arrives
// onDone(fullText), called when stream completes
async function streamRequest(url, body, onChunk, onDone) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.done) { onDone?.(fullText); return; }
        if (parsed.text) {
          fullText += parsed.text;
          onChunk?.(parsed.text, fullText);
        }
      } catch (e) {
        // skip malformed lines
      }
    }
  }

  onDone?.(fullText);
}

export const aiService = {
  // Streaming chat
  // Usage: aiService.chat(msg, [], { onChunk: (chunk, full) => ..., onDone: (data) => ... })
  async chat(message, conversationHistory = [], { onChunk, onDone } = {}) {
    try {
      tracker.exceedsRateLimit();
      tracker.checkBudget();
      await streamRequest(
        '/api/chat',
        { message, history: conversationHistory },
        onChunk,
        (fullText) => {
          tracker.addRequest(message, fullText);
          onDone?.({ message: fullText, role: 'assistant', _stats: tracker.getStats() });
        }
      );
    } catch (error) {
      console.error('Chat API error:', error);
      throw error;
    }
  },

  // Streaming summarize
  async summarize(text, { onChunk, onDone } = {}) {
    try {
      tracker.exceedsRateLimit();
      tracker.checkBudget();
      await streamRequest(
        '/api/summarize',
        { text },
        onChunk,
        (fullText) => {
          tracker.addRequest(text, fullText);
          onDone?.({ summary: fullText, _stats: tracker.getStats() });
        }
      );
    } catch (error) {
      console.error('Summarize API error:', error);
      throw error;
    }
  },

  // Streaming generateText
  async generateText(prompt, { onChunk, onDone } = {}) {
    try {
      tracker.exceedsRateLimit();
      tracker.checkBudget();
      await streamRequest(
        '/api/generate',
        { prompt },
        onChunk,
        (fullText) => {
          tracker.addRequest(prompt, fullText);
          onDone?.({ generated: fullText, _stats: tracker.getStats() });
        }
      );
    } catch (error) {
      console.error('Generate API error:', error);
      throw error;
    }
  },

  getStats() { return tracker.getStats(); },
  resetUsage() { tracker.reset(); },
  isBudgetExceeded() { return tracker.getRemainingBudget() <= 0; },
};

export default aiService;
export { tracker as usageTracker };