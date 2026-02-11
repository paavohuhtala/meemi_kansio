import { apiFetch, apiFetchFormData } from './client';

export interface MediaItem {
  id: string;
  name: string | null;
  description: string | null;
  media_type: 'image' | 'video' | 'gif';
  file_url: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
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
