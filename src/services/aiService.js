/**
 * AI Service - Handles all API calls to Claude/OpenAI
 * Includes rate limiting and usage tracking for $5 budget
 * Never expose API keys in frontend - use backend proxy instead
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Claude 3.5 Sonnet pricing (as of 2024)
const PRICING = {
  INPUT_PER_1M_TOKENS: 3,      // $3 per 1M input tokens
  OUTPUT_PER_1M_TOKENS: 15,    // $15 per 1M output tokens
  BUDGET_CENTS: 500,           // $5.00
};

// Rate limiting settings
const RATE_LIMITS = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_REQUESTS_PER_HOUR: 100,
  DEBOUNCE_MS: 1000,
};

class UsageTracker {
  constructor() {
    this.loadUsage();
    this.requestTimestamps = [];
    this.lastRequestTime = {};
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

  // Estimate tokens (rough calculation: ~4 chars per token)
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // Calculate cost in cents
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

    // Clean up old timestamps
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
    const remaining = this.getRemainingBudget();
    if (remaining <= 0) {
      throw new Error('Budget exceeded: $5.00 credit limit reached');
    }
    if (remaining < 50) {
      console.warn(`⚠️ Low budget warning: Only $${(remaining / 100).toFixed(2)} remaining`);
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

// Debounce helper for preventing rapid repeated calls
function debounce(fn, delay) {
  let timeoutId = null;
  return function(...args) {
    clearTimeout(timeoutId);
    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(fn(...args));
      }, delay);
    });
  };
}

export const aiService = {
  async chat(message, conversationHistory = []) {
    try {
      // Check rate limits and budget
      tracker.exceedsRateLimit();
      tracker.checkBudget();

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          history: conversationHistory,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `API error: ${response.status}`);
      }

      const data = await response.json();

      // Track usage
      tracker.addRequest(message, data.message);

      return {
        ...data,
        _stats: tracker.getStats(),
      };
    } catch (error) {
      console.error('Chat API error:', error);
      throw error;
    }
  },

  async summarize(text) {
    try {
      tracker.exceedsRateLimit();
      tracker.checkBudget();

      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Failed to summarize: ${response.status}`);
      }

      const data = await response.json();
      tracker.addRequest(text, data.summary);

      return {
        ...data,
        _stats: tracker.getStats(),
      };
    } catch (error) {
      console.error('Summarize API error:', error);
      throw error;
    }
  },

  async generateText(prompt) {
    try {
      tracker.exceedsRateLimit();
      tracker.checkBudget();

      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate text: ${response.status}`);
      }

      const data = await response.json();
      tracker.addRequest(prompt, data.generated);

      return {
        ...data,
        _stats: tracker.getStats(),
      };
    } catch (error) {
      console.error('Generate API error:', error);
      throw error;
    }
  },

  // Get usage statistics
  getStats() {
    return tracker.getStats();
  },

  // Reset usage (admin only)
  resetUsage() {
    tracker.reset();
  },

  // Check if budget exceeded
  isBudgetExceeded() {
    return tracker.getRemainingBudget() <= 0;
  },
};

export default aiService;
export { tracker as usageTracker };
