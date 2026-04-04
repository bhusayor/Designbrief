import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url?.split('?')[0];

  // ── GET /api/health ──────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/health') {
    return res.json({ status: 'OK', message: 'AI API Server is running' });
  }

  // ── POST /api/chat ───────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/chat') {
    try {
      const { message, system = '', maxTokens = 1500 } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: Math.min(maxTokens, 4096),
        ...(system && { system }),
        messages: [{ role: 'user', content: message }],
      });

      const reply = response.content[0].type === 'text' ? response.content[0].text : '';
      return res.json({ message: reply, role: 'assistant' });
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: 'Failed to process chat message', message: error.message });
    }
  }

  // ── POST /api/summarize ──────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/summarize') {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: `Please summarize the following text:\n\n${text}` }],
      });

      const summary = response.content[0].type === 'text' ? response.content[0].text : '';
      return res.json({ summary });
    } catch (error) {
      console.error('Summarize error:', error);
      return res.status(500).json({ error: 'Failed to summarize text', message: error.message });
    }
  }

  // ── POST /api/generate ───────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/generate') {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const generated = response.content[0].type === 'text' ? response.content[0].text : '';
      return res.json({ generated });
    } catch (error) {
      console.error('Generate error:', error);
      return res.status(500).json({ error: 'Failed to generate text', message: error.message });
    }
  }

  // ── 404 fallback ─────────────────────────────────────────────────
  return res.status(404).json({ error: 'Not found' });
}