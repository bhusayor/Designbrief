# AI Features Setup Guide

This guide walks you through fixing common AI integration issues and getting your AI features working locally.

## Common Issues & Fixes

### ❌ Issue 1: Missing API Key in `.env.local`
**Symptom:** Error like "API key undefined" or "Unauthorized"

**Fix:**
1. Create `.env.local` file in the project root:
   ```bash
   VITE_API_KEY=your_anthropic_api_key_here
   VITE_API_BASE_URL=http://localhost:3001
   ```
2. Get your API key from [Anthropic Console](https://console.anthropic.com/)
3. **⚠️ NEVER commit this file** - it's already in `.gitignore`

### ❌ Issue 2: API Key Exposed in Frontend Code
**Symptom:** Security warning or key accidentally committed to GitHub

**Fix (Already Done):**
- ✅ Uses environment variables with `VITE_` prefix
- ✅ All API calls go through backend proxy at `http://localhost:3001`
- ✅ Backend handles the actual API key (never exposed to browser)
- ✅ `.gitignore` prevents accidental commits

### ❌ Issue 3: CORS Errors (Cross-Origin Requests Blocked)
**Symptom:** Error like "Access to XMLHttpRequest blocked by CORS policy"

**Fix (Already Done):**
- ✅ Backend uses Express with `cors()` middleware
- ✅ Frontend calls `http://localhost:3001` instead of external APIs
- ✅ No direct external API calls from React

### ❌ Issue 4: Missing Error Handling
**Symptom:** App crashes on API errors, no feedback to user

**Fix (Already Done):**
- ✅ `useAI` hook manages loading/error states
- ✅ ChatComponent displays error messages
- ✅ Try-catch blocks in all API calls
- ✅ User-friendly error messages

### ❌ Issue 5: Backend Not Running
**Symptom:** "Connection refused" or "Cannot reach http://localhost:3001"

**Fix:** Start the backend server (see setup steps below)

---

## Setup Steps

### 1️⃣ Install Dependencies
```bash
cd "/Users/mac/Debrief v1/my-react-app"
npm install
```

This installs:
- Frontend: React, Vite
- Backend: Express, Anthropic SDK, CORS, etc.

### 2️⃣ Create Environment Variables
Create/update `.env.local`:
```bash
VITE_API_KEY=sk-ant-your_actual_key_here
VITE_API_BASE_URL=http://localhost:3001
```

Get your key: https://console.anthropic.com/

### 3️⃣ Create Backend Environment File
Create `.env` in the project root:
```bash
ANTHROPIC_API_KEY=sk-ant-your_actual_key_here
PORT=3001
```

### 4️⃣ Start Backend & Frontend

**Option A: Run separately (2 terminals)**

Terminal 1 - Backend:
```bash
npm run server
```
You should see: `AI API Server running on http://localhost:3001`

Terminal 2 - Frontend:
```bash
npm run dev
```
You should see: `Local: http://localhost:5173`

**Option B: Run together (1 terminal)**
```bash
npm run dev:full
```

### 5️⃣ Test the Backend
```bash
curl http://localhost:3001/health
```
Expected response:
```json
{"status":"OK","message":"AI API Server is running"}
```

### 6️⃣ Use AI Features in Your App
```jsx
import ChatComponent from './components/ChatComponent';

function App() {
  return (
    <>
      {/* Your existing code */}
      <ChatComponent />
    </>
  );
}
```

---

## File Structure
```
my-react-app/
├── .env                          # Backend API key (⚠️ Never commit)
├── .env.local                    # Frontend env vars (⚠️ Never commit)
├── server.js                     # Backend: Express + Claude API
├── package.json                  # Dependencies + scripts
├── src/
│   ├── components/
│   │   ├── ChatComponent.jsx     # Example chat UI component
│   │   └── ChatComponent.css     # Component styles
│   ├── services/
│   │   └── aiService.js          # API calls (safe proxy calls)
│   ├── hooks/
│   │   └── useAI.js              # React hook for AI state
│   ├── App.jsx
│   └── main.jsx
```

---

## Troubleshooting

### Problem: "Cannot find module '@anthropic-sdk/sdk'"
**Solution:** Run `npm install`

### Problem: "ECONNREFUSED: Connection refused at localhost:3001"
**Solution:** Make sure backend is running with `npm run server`

### Problem: "API key is undefined"
**Solutions:**
1. Check `.env` file exists and has `ANTHROPIC_API_KEY=...`
2. Restart backend after changing `.env`
3. Check key is correct from https://console.anthropic.com/

### Problem: "CORS error" (even with backend running)
**Solutions:**
1. Confirm backend is on `http://localhost:3001`
2. Check `VITE_API_BASE_URL=http://localhost:3001` in `.env.local`
3. Restart frontend (`npm run dev`)

### Problem: Changes not working after editing files
**Solutions:**
1. **Backend changes:** Restart `npm run server`
2. **Frontend changes:** Vite has hot reload, but restart if issues persist

---

## API Endpoints

### POST /api/chat
Send a message to Claude for conversation.

**Request:**
```json
{
  "message": "What is React?",
  "history": []
}
```

**Response:**
```json
{
  "message": "React is a JavaScript library for building user interfaces...",
  "role": "assistant"
}
```

### POST /api/summarize
Summarize text using Claude.

**Request:**
```json
{
  "text": "Long text to summarize..."
}
```

**Response:**
```json
{
  "summary": "Summary of the text..."
}
```

### POST /api/generate
Generate text from a prompt.

**Request:**
```json
{
  "prompt": "Write a short poem about React"
}
```

**Response:**
```json
{
  "generated": "React, powerful and fast..."
}
```

---

## Security Checklist

- ✅ API key in `.env` (backend only)
- ✅ API key in `.env.local` (frontend, for reference)
- ✅ Both `.env*` files in `.gitignore`
- ✅ All external API calls go through backend
- ✅ No API keys in frontend code
- ✅ CORS enabled only for local development
- ✅ Error messages don't expose sensitive info

---

## Next Steps

1. **Test with ChatComponent:**
   - Open http://localhost:5173
   - Type a message
   - See AI response

2. **Build your own components:**
   - Use `useAI()` hook similarly in other components
   - Follow the same pattern: service → hook → component

3. **Deploy safely:**
   - For production, use environment variables from your hosting platform
   - Never commit `.env` files
   - Use proper rate limiting on backend
   - Add authentication if needed

---

## Support

If you encounter issues:
1. Check backend is running: `curl http://localhost:3001/health`
2. Check logs in both terminal windows
3. Verify API key is valid at https://console.anthropic.com/
4. Check all environment variables are set correctly
