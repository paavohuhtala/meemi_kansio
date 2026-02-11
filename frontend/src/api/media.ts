import { apiFetch, apiFetchFormData } from './client';

export interface MediaItem {
  id: string;
  name: string | null;
  description: string | null;
  media_type: 'image' | 'video' | 'gif';
  file_url: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface MediaPage {
  items: MediaItem[];
  next_cursor: string | null;
}

export function uploadMedia(file: File, name?: string, description?: string) {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  if (description) form.append('description', description);
  return apiFetchFormData<MediaItem>('/media/upload', form);
}

export function getMedia(id: string) {
  return apiFetch<MediaItem>(`/media/${id}`);
}

export function listMedia(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}

export function updateMedia(id: string, data: { name?: string; description?: string }) {
  return apiFetch<MediaItem>(`/media/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
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
