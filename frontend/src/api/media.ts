import { apiFetch, apiFetchFormData } from './client';

export interface MediaItem {
  id: string;
  name: string | null;
  description: string | null;
  media_type: 'image' | 'video' | 'gif';
  file_url: string;
  thumbnail_url: string | null;
  clipboard_url: string | null;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
  tags: string[];
}

export interface MediaPage {
  items: MediaItem[];
  next_cursor: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export function uploadMedia(file: File, name?: string, description?: string, tags?: string[]) {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  if (description) form.append('description', description);
  if (tags && tags.length > 0) form.append('tags', JSON.stringify(tags));
  return apiFetchFormData<MediaItem>('/media/upload', form);
}

export function getMedia(id: string) {
  return apiFetch<MediaItem>(`/media/${id}`);
}

export function listMedia(cursor?: string, tags?: string[]) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}

export function updateMedia(id: string, data: { name?: string; description?: string }) {
  return apiFetch<MediaItem>(`/media/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function setMediaTags(id: string, tags: string[]) {
  return apiFetch<MediaItem>(`/media/${id}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

export function replaceMediaFile(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiFetchFormData<MediaItem>(`/media/${id}/file`, form, 'PUT');
}

export function deleteMedia(id: string) {
  return apiFetch<void>(`/media/${id}`, { method: 'DELETE' });
}

export function searchTags(q: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const qs = params.toString();
  return apiFetch<{ tags: Tag[] }>(`/tags${qs ? `?${qs}` : ''}`);
}
