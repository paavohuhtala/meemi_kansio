import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia } from '../api/media';
import { Button, DropZone, FilePreviewGrid, type FileEntry } from '../components';

const Container = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xxl};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

function nameFromFile(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}`;
}

function filesToEntries(files: File[]): FileEntry[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    status: 'pending' as const,
  }));
}

export function UploadPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<FileEntry[]>(() => {
    const state = location.state as { files?: File[]; file?: File } | null;
    if (state?.files && Array.isArray(state.files)) {
      const valid = state.files.filter((f) => f instanceof File);
      return filesToEntries(valid);
    }
    if (state?.file instanceof File) {
      return filesToEntries([state.file]);
    }
    return [];
  });

  const pendingCount = entries.filter((e) => e.status === 'pending').length;
  const isUploading = entries.some((e) => e.status === 'uploading');
  const uploadDisabled = pendingCount === 0;

  // Upload a single entry by id and file
  function uploadEntry(id: string, file: File) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'uploading' as const } : e,
      ),
    );

    uploadMedia(file, nameFromFile(file))
      .then((media) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, status: 'success' as const, media, error: undefined } : e,
          ),
        );
        queryClient.invalidateQueries({ queryKey: ['media-list'] });
      })
      .catch((err) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, status: 'error' as const, error: err.message ?? 'Upload failed' }
              : e,
          ),
        );
      });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const pending = entries.filter((entry) => entry.status === 'pending');
    if (pending.length === 0) return;

    for (const entry of pending) {
      uploadEntry(entry.id, entry.file);
    }
  }

  const handleAdd = useCallback(
    (files: File[]) => {
      setEntries((prev) => {
        const existingKeys = new Set(prev.map((e) => fileKey(e.file)));
        const newFiles = files.filter((f) => !existingKeys.has(fileKey(f)));
        if (newFiles.length === 0) return prev;
        return [...prev, ...filesToEntries(newFiles)];
      });
    },
    [],
  );

  function handleRemove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleReplace(id: string, file: File) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, file, status: 'pending' as const, media: undefined, error: undefined }
          : e,
      ),
    );
  }

  function handleRetry(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (entry) uploadEntry(id, entry.file);
  }

  function handleDropZoneChange(files: File[]) {
    setEntries(filesToEntries(files));
  }

  // Page-level paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const clipboardFiles = Array.from(e.clipboardData?.files ?? []);
      const accepted = clipboardFiles.filter((f) => ACCEPTED_TYPES.includes(f.type));
      if (accepted.length > 0) {
        handleAdd(accepted);
      }
    }

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handleAdd]);

  // Upload button label
  let uploadButtonText = 'Upload';
  if (pendingCount > 1) {
    uploadButtonText = `Upload ${pendingCount} files`;
  }

  // Empty state: show DropZone
  if (entries.length === 0) {
    return (
      <Container>
        <Heading>Upload</Heading>
        <Form onSubmit={handleSubmit}>
          <DropZone
            multiple
            value={[]}
            onChange={handleDropZoneChange}
            accept={ACCEPTED_TYPES}
          />

          <Button type="submit" disabled data-testid="upload-submit">
            Upload
          </Button>
        </Form>
      </Container>
    );
  }

  // Grid state: show FilePreviewGrid + Upload button
  return (
    <Container>
      <Heading>Upload</Heading>
      <Form onSubmit={handleSubmit}>
        <FilePreviewGrid
          entries={entries}
          accept={ACCEPTED_TYPES}
          onRemove={handleRemove}
          onReplace={handleReplace}
          onAdd={handleAdd}
          onRetry={handleRetry}
        />
        <Button
          type="submit"
          disabled={uploadDisabled}
          loading={isUploading}
          data-testid="upload-submit"
        >
          {uploadButtonText}
        </Button>
      </Form>
    </Container>
  );
}
