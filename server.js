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
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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
      model: 'claude-sonnet-4-5',
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
      model: 'claude-sonnet-4-5',
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
      model: 'claude-sonnet-4-5',
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

// DesignBrief AI — unified Claude endpoint
// Accepts: { system, message, maxTokens }
// Returns: { text }
app.post('/api/claude', async (req, res) => {
  try {
    const { system = '', message, maxTokens = 2000 } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: Math.min(maxTokens, 8096),
      ...(system && { system }),
      messages: [{ role: 'user', content: message }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    res.json({ text });
  } catch (error) {
    console.error('Claude error:', error);
    res.status(500).json({
      error: 'Failed to call Claude',
      message: error.message,
    });
  }
});

// DesignBrief AI — Claude with web search
// Accepts: { system, message, maxTokens }
// Returns: { text }
app.post('/api/claude-search', async (req, res) => {
  try {
    const { system = '', message, maxTokens = 2000 } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: Math.min(maxTokens, 4096),
      ...(system && { system }),
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: message }],
    });

    // Extract all text blocks (web search returns multiple content blocks)
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    res.json({ text });
  } catch (error) {
    console.error('Claude search error:', error);
    res.status(500).json({
      error: 'Failed to call Claude with search',
      message: error.message,
    });
  }
});

// DesignBrief AI — streaming Claude endpoint
// Accepts: { system, message, maxTokens }
// Returns: SSE stream of { text } and { done: true }
app.post('/api/claude-stream', async (req, res) => {
  try {
    const { system = '', message, maxTokens = 1000 } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: Math.min(maxTokens, 4096),
      ...(system && { system }),
      messages: [{ role: 'user', content: message }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Claude stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream Claude', message: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ done: true, error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Team invite endpoint
app.post('/api/invite', async (req, res) => {
  try {
    const {
      email, inviteToken, projectId,
      projectName, jobRole, inviterName,
    } = req.body;

    if (!email || !inviteToken) {
      return res.status(400).json({ error: 'email and inviteToken are required' });
    }

    const inviteLink = (
      process.env.VITE_APP_URL || 'http://localhost:5173'
    ) + '/join/' + inviteToken;

    // Try Supabase admin invite if service key exists
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: {
            invite_token: inviteToken,
            project_id: projectId,
            job_role: jobRole,
            invited_by: inviterName,
            project_name: projectName,
          },
          redirectTo: inviteLink,
        });
        return res.json({ success: true, method: 'supabase', inviteLink });
      } catch (adminErr) {
        console.warn('Supabase admin invite failed:', adminErr.message);
        // Fall through to link-only response
      }
    }

    // Fallback — return invite link only
    res.json({
      success: true,
      method: 'link-only',
      inviteLink,
      message: 'Share this link with ' + email,
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to send invite', message: error.message });
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
  console.log('  POST /api/claude');
  console.log('  POST /api/claude-search');
  console.log('  POST /api/claude-stream');
  console.log('  POST /api/invite');
});
