import { apiFetch } from './client';

export interface Invite {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  expires_at: string;
  created_at: string;
}

export function listInvites() {
  return apiFetch<Invite[]>('/invites');
}

export function createInvite(expires_in_hours?: number) {
  return apiFetch<Invite>('/invites', {
    method: 'POST',
    body: JSON.stringify({ expires_in_hours }),
  });
}
