import { authedFetch } from './getAuthHeader'

export async function sendInvite(workspaceId, email, role) {
  return authedFetch('/api/invite', { action: 'send', workspaceId, email, role })
}

export async function listInvites(workspaceId) {
  return authedFetch('/api/invite', { action: 'list', workspaceId })
}

export async function cancelInvite(workspaceId, inviteId) {
  return authedFetch('/api/invite', { action: 'cancel', workspaceId, inviteId })
}

export async function listMembers(workspaceId) {
  return authedFetch('/api/invite', { action: 'list_members', workspaceId })
}

export async function removeMember(workspaceId, userId) {
  return authedFetch('/api/invite', { action: 'remove_member', workspaceId, userId })
}
