/**
 * Backend API Server - Node.js + Express
 * This proxies AI API calls securely (API key never exposed to frontend)
 *
 * Setup:
 * 1. npm install express cors dotenv @anthropic-sdk/sdk
 * 2. Create .env with: ANTHROPIC_API_KEY=your_key_here
 * 3. node server.js
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'AI API Server is running' });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, system = '', maxTokens = 1500 } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const messages = [
      { role: 'user', content: message }
    ];

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: Math.min(maxTokens, 4096),
      ...(system && { system }),
      messages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    res.json({
      message: reply,
      role: 'assistant',
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error.message,
    });
  }
});

// Summarize endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Please summarize the following text:\n\n${text}`,
        },
      ],
    });

    const summary = response.content[0].type === 'text' ? response.content[0].text : '';

    res.json({ summary });
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({
      error: 'Failed to summarize text',
      message: error.message,
    });
  }
});

// Generate text endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const generated = response.content[0].type === 'text' ? response.content[0].text : '';

    res.json({ generated });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({
      error: 'Failed to generate text',
      message: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`AI API Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/chat');
  console.log('  POST /api/summarize');
  console.log('  POST /api/generate');
});
