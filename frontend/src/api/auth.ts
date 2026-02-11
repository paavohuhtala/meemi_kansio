import { apiFetch } from './client';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'member';
  created_at: string;
}

export function getMe() {
  return apiFetch<User>('/auth/me');
}

export function login(username: string, password: string) {
  return apiFetch<User>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string, invite_code?: string) {
  return apiFetch<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, invite_code: invite_code || undefined }),
  });
}

export function logout() {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}
