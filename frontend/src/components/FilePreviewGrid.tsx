import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cross2Icon,
  ReloadIcon,
  UploadIcon,
  CheckCircledIcon,
} from '@radix-ui/react-icons';
import styled, { css, keyframes } from 'styled-components';
import type { MediaItem } from '../api/media';

// ---------- Types ----------

export interface FileEntry {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  media?: MediaItem;
  error?: string;
}

interface FilePreviewGridProps {
  entries: FileEntry[];
  accept: string[];
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onAdd: (files: File[]) => void;
  onRetry: (id: string) => void;
}

// ---------- Helpers ----------

function isAcceptedType(file: File, accept: string[]): boolean {
  return accept.some((type) => file.type === type);
}

function isVideoType(file: File): boolean {
  return file.type.startsWith('video/');
}

// ---------- Animations ----------

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// ---------- Styled components ----------

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const CardWrapper = styled.div`
  position: relative;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  flex-direction: column;
`;

const CardMedia = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
`;

const CardImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const CardVideo = styled.video`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const CardInfo = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  overflow: hidden;
`;

const FileName = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.colors.text};
`;

// ---------- Overlay styles ----------

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const UploadingOverlay = styled(Overlay)`
  background: rgba(0, 0, 0, 0.6);
`;

const SpinningIcon = styled(ReloadIcon)`
  width: 24px;
  height: 24px;
  color: white;
  animation: ${spin} 1s linear infinite;
`;

const SuccessBadge = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.sm};
  left: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.success};
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ErrorOverlay = styled(Overlay)`
  background: rgba(239, 68, 68, 0.7);
  padding: ${({ theme }) => theme.spacing.sm};
`;

const ErrorText = styled.span`
  color: white;
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
  word-break: break-word;
`;

const RetryButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid white;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: transparent;
  color: white;
  font-size: ${({ theme }) => theme.fontSize.sm};
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

// ---------- Remove button ----------

const RemoveButton = styled.button`
  position: absolute;
  top: ${({ theme }) => theme.spacing.xs};
  right: ${({ theme }) => theme.spacing.xs};
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

// ---------- Card link wrapper for success state ----------

const CardLink = styled.a`
  text-decoration: none;
  color: inherit;

  &:hover {
    opacity: 0.85;
  }
`;

// ---------- DropTarget highlight ----------

const DropHighlight = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border: 2px solid transparent;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.15s, background 0.15s;

  ${({ $active, theme }) =>
    $active &&
    css`
      border-color: ${theme.colors.primary};
      background: ${theme.colors.primary}15;
    `}
`;

// ---------- AddFileCard styles ----------

const AddCardContainer = styled.div<{ $dragOver: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  aspect-ratio: 1;
  border: 2px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  ${({ $dragOver, theme }) =>
    $dragOver &&
    css`
      border-color: ${theme.colors.primary};
      background: ${theme.colors.primary}15;
    `}

  &:hover {
    border-color: ${({ theme }) => theme.colors.textSecondary};
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

const AddCardText = styled.span`
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const HiddenInput = styled.input`
  display: none;
`;

// ---------- FileCard component ----------

function FileCard({
  entry,
  accept,
  onRemove,
  onReplace,
  onRetry,
}: {
  entry: FileEntry;
  accept: string[];
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onRetry: (id: string) => void;
}) {
  const { id, file, status, media, error } = entry;
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isReplaceable = status === 'pending' || status === 'error';

  function handleCardClick() {
    if (status === 'pending') {
      replaceInputRef.current?.click();
    }
  }

  function handleReplaceInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && isAcceptedType(f, accept)) {
      onReplace(id, f);
    }
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    if (!isReplaceable) return;
    e.preventDefault();
    setDropActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.preventDefault();
    setDropActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropActive(false);
    if (!isReplaceable) return;
    const files = Array.from(e.dataTransfer.files);
    const accepted = files.find((f) => isAcceptedType(f, accept));
    if (accepted) {
      onReplace(id, accepted);
    }
  }

  const cardContent = (
    <CardWrapper
      data-testid="file-card"
      onClick={handleCardClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: status === 'pending' ? 'pointer' : undefined }}
    >
      {isReplaceable && (
        <DropHighlight $active={dropActive} />
      )}

      <CardMedia>
        {isVideoType(file) ? (
          <CardVideo src={previewUrl} muted preload="metadata" />
        ) : (
          <CardImage src={previewUrl} alt={file.name} />
        )}

        {/* Status overlays */}
        {status === 'uploading' && (
          <UploadingOverlay>
            <SpinningIcon />
          </UploadingOverlay>
        )}

        {status === 'success' && (
          <SuccessBadge>
            <CheckCircledIcon />
          </SuccessBadge>
        )}

        {status === 'error' && (
          <ErrorOverlay>
            <ErrorText>{error ?? 'Upload failed'}</ErrorText>
            <RetryButton
              onClick={(e) => {
                e.stopPropagation();
                onRetry(id);
              }}
            >
              <ReloadIcon /> Retry
            </RetryButton>
          </ErrorOverlay>
        )}
      </CardMedia>

      <CardInfo>
        <FileName>{file.name}</FileName>
      </CardInfo>

      <RemoveButton
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove(id);
        }}
        aria-label={`Remove ${file.name}`}
      >
        <Cross2Icon />
      </RemoveButton>

      {/* Hidden input for replace via click */}
      <HiddenInput
        ref={replaceInputRef}
        type="file"
        accept={accept.join(',')}
        onChange={handleReplaceInput}
        onClick={(e) => e.stopPropagation()}
      />
    </CardWrapper>
  );

  if (status === 'success' && media) {
    return (
      <CardLink href={`/media/${media.id}`} target="_blank" rel="noopener">
        {cardContent}
      </CardLink>
    );
  }

  return cardContent;
}

// ---------- AddFileCard component ----------

function AddFileCard({
  accept,
  onAdd,
}: {
  accept: string[];
  onAdd: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const accepted = Array.from(e.target.files).filter((f) =>
        isAcceptedType(f, accept),
      );
      if (accepted.length > 0) {
        onAdd(accepted);
      }
    }
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const accepted = Array.from(e.dataTransfer.files).filter((f) =>
        isAcceptedType(f, accept),
      );
      if (accepted.length > 0) {
        onAdd(accepted);
      }
    }
  }

  return (
    <AddCardContainer
      data-testid="add-file-card"
      $dragOver={dragOver}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <UploadIcon />
      <AddCardText>Add files</AddCardText>
      <HiddenInput
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        onChange={handleInputChange}
        multiple
      />
    </AddCardContainer>
  );
}

// ---------- FilePreviewGrid component ----------

export function FilePreviewGrid({
  entries,
  accept,
  onRemove,
  onReplace,
  onAdd,
  onRetry,
}: FilePreviewGridProps) {
  return (
    <Grid data-testid="preview-grid">
      {entries.map((entry) => (
        <FileCard
          key={entry.id}
          entry={entry}
          accept={accept}
          onRemove={onRemove}
          onReplace={onReplace}
          onRetry={onRetry}
        />
      ))}
      <AddFileCard accept={accept} onAdd={onAdd} />
    </Grid>
  );
}
