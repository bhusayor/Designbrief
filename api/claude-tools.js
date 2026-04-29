import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { messages, system = '', maxTokens = 2000, tools } = req.body

    if (!messages?.length) {
      return res.status(400).json({ error: 'messages is required' })
    }

    const params = {
      model: MODEL,
      max_tokens: Math.min(maxTokens, 8096),
      messages,
      ...(system && { system }),
      ...(tools?.length && { tools }),
    }

    const response = await client.messages.create(params)
    res.json({ content: response.content, stop_reason: response.stop_reason })
  } catch (error) {
    console.error('[claude-tools] error:', error)
    res.status(500).json({ error: error.message })
  }
}
