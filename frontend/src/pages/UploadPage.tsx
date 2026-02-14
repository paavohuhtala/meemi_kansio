import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia, type MediaItem } from '../api/media';
import { Button, DropZone } from '../components';

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

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const ResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const ResultCard = styled.div`
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  flex-direction: column;
`;

const ResultThumb = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
`;

const ResultInfo = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  overflow: hidden;
`;

const ResultName = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultStatus = styled.div<{ $error?: boolean }>`
  color: ${({ theme, $error }) => $error ? theme.colors.error : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const ResultLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  &:hover {
    opacity: 0.8;
  }
`;

const ProgressText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
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

type UploadStatus =
  | { status: 'pending' }
  | { status: 'uploading' }
  | { status: 'success'; media: MediaItem }
  | { status: 'error'; error: string };

interface BulkEntry {
  file: File;
  result: UploadStatus;
}

export function UploadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<File[]>(() => {
    const state = location.state as { files?: File[]; file?: File } | null;
    if (state?.files && Array.isArray(state.files)) {
      return state.files.filter((f) => f instanceof File);
    }
    if (state?.file instanceof File) return [state.file];
    return [];
  });

  const [entries, setEntries] = useState<BulkEntry[] | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  const isBulk = files.length > 1 || (entries !== null && entries.length > 1);
  const isUploading = entries?.some((e) => e.result.status === 'uploading') ?? false;
  const isDone = entries !== null && entries.every(
    (e) => e.result.status === 'success' || e.result.status === 'error',
  );
  const settledCount = entries?.filter(
    (e) => e.result.status === 'success' || e.result.status === 'error',
  ).length ?? 0;

  function uploadFile(file: File, updateEntry: (result: UploadStatus) => void) {
    updateEntry({ status: 'uploading' });
    uploadMedia(file, nameFromFile(file))
      .then((media) => updateEntry({ status: 'success', media }))
      .catch((err) => updateEntry({ status: 'error', error: err.message ?? 'Upload failed' }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    // Single file: use simple flow with auto-navigate
    if (files.length === 1) {
      setSingleError(null);
      const initial: BulkEntry[] = [{ file: files[0], result: { status: 'uploading' } }];
      setEntries(initial);
      uploadMedia(files[0], nameFromFile(files[0]))
        .then((media) => {
          queryClient.invalidateQueries({ queryKey: ['media-list'] });
          navigate(`/media/${media.id}`);
        })
        .catch((err) => {
          setSingleError(err.message ?? 'Upload failed');
          setEntries(null);
        });
      return;
    }

    // Bulk: fire all concurrently
    const initial: BulkEntry[] = files.map((file) => ({
      file,
      result: { status: 'pending' as const },
    }));
    setEntries(initial);

    initial.forEach((entry, index) => {
      uploadFile(entry.file, (result) => {
        setEntries((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[index] = { ...next[index], result };
          return next;
        });
        if (result.status === 'success') {
          queryClient.invalidateQueries({ queryKey: ['media-list'] });
        }
      });
    });
  }

  function handleRetry(index: number) {
    if (!entries) return;
    const entry = entries[index];
    uploadFile(entry.file, (result) => {
      setEntries((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[index] = { ...next[index], result };
        return next;
      });
      if (result.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['media-list'] });
      }
    });
  }

  function handleReset() {
    setFiles([]);
    setEntries(null);
    setSingleError(null);
  }

  // Phase 2/3: Show results grid (bulk only)
  if (entries && isBulk) {
    return (
      <Container>
        <Heading>Upload</Heading>
        {!isDone && (
          <ProgressText>Uploaded {settledCount} / {entries.length}</ProgressText>
        )}
        <ResultsGrid data-testid="results-grid">
          {entries.map((entry, i) => {
            const r = entry.result;
            if (r.status === 'success') {
              return (
                <ResultLink key={i} to={`/media/${r.media.id}`} data-testid="result-card">
                  <ResultCard>
                    {r.media.thumbnail_url ? (
                      <ResultThumb src={r.media.thumbnail_url} alt={entry.file.name} />
                    ) : null}
                    <ResultInfo>
                      <ResultName>{entry.file.name}</ResultName>
                    </ResultInfo>
                  </ResultCard>
                </ResultLink>
              );
            }
            return (
              <ResultCard key={i} data-testid="result-card">
                <ResultInfo>
                  <ResultName>{entry.file.name}</ResultName>
                  {r.status === 'error' ? (
                    <>
                      <ResultStatus $error>{r.error}</ResultStatus>
                      <Button
                        variant="ghost"
                        onClick={() => handleRetry(i)}
                        data-testid="retry-button"
                      >
                        Retry
                      </Button>
                    </>
                  ) : (
                    <ResultStatus>
                      {r.status === 'uploading' ? 'Uploading...' : 'Waiting...'}
                    </ResultStatus>
                  )}
                </ResultInfo>
              </ResultCard>
            );
          })}
        </ResultsGrid>
        {isDone && (
          <Actions>
            <Button onClick={handleReset} data-testid="upload-more">Upload more</Button>
          </Actions>
        )}
      </Container>
    );
  }

  // Phase 1: Selection
  return (
    <Container>
      <Heading>Upload</Heading>
      <Form onSubmit={handleSubmit}>
        <DropZone
          multiple
          value={files}
          onChange={setFiles}
          accept={ACCEPTED_TYPES}
        />
        {singleError && <ErrorText>{singleError}</ErrorText>}
        <Button
          type="submit"
          disabled={files.length === 0}
          loading={isUploading && !isBulk}
          data-testid="upload-submit"
        >
          {isUploading && !isBulk
            ? 'Uploading...'
            : files.length > 1
              ? `Upload ${files.length} files`
              : 'Upload'}
        </Button>
      </Form>
    </Container>
  );
}
