import { supabase } from './supabase'

function getTokenFromStorage() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = JSON.parse(localStorage.getItem(key) || 'null')
        if (val?.access_token) return val.access_token
      }
    }
  } catch {}
  return null
}

export async function getAuthHeader() {
  // 1. Read from localStorage (synchronous, no network)
  const stored = getTokenFromStorage()
  if (stored) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + stored }
  }

  // 2. Retry getSession() up to 3 times with 400ms gaps
  let session = null
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await supabase.auth.getSession()
      session = data?.session
      if (session?.access_token) break
    } catch {}
    if (i < 2) await new Promise(r => setTimeout(r, 400))
  }

  if (!session?.access_token) return null

  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + session.access_token,
  }
}

export async function authedFetch(url, body) {
  const headers = await getAuthHeader()

  if (!headers) {
    throw new Error('Not authenticated. Please refresh the page.')
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Request failed: ' + res.status)
  }

  return data
}

export async function callConnector(type, body) {
  return authedFetch('/api/connectors/' + type, { type, ...body })
}
