import { supabase } from './supabase'

export async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) return null

  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + session.access_token,
  }
}

export async function authedFetch(url, body) {
  const headers = await getAuthHeader()

  if (!headers) {
    throw new Error('Not authenticated. Please sign in again.')
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
