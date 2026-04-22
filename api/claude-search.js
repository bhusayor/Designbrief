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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { message, system = '', maxTokens = 2000 } = req.body

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: Math.min(maxTokens, 8096),
      ...(system && { system }),
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: message }],
    })

    // Extract all text blocks — web search returns multiple content blocks
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    res.json({ content: response.content, text })
  } catch (error) {
    console.error('Claude search error:', error)
    res.status(500).json({ error: error.message })
  }
}
