import { useEffect, useRef, useState } from 'react';
import { UploadIcon } from '@radix-ui/react-icons';
import styled, { css } from 'styled-components';

interface DropZoneProps {
  value: File | null;
  onChange: (file: File) => void;
  accept: string[];
}

const Container = styled.div<{ $dragOver: boolean; $hasFile: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 2px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  overflow: hidden;

  ${({ $dragOver, theme }) =>
    $dragOver &&
    css`
      border-color: ${theme.colors.primary};
      background: ${theme.colors.primary}15;
    `}

  ${({ $hasFile }) =>
    $hasFile &&
    css`
      border-style: solid;
      min-height: 0;
    `}

  &:hover {
    border-color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};

  svg {
    width: 32px;
    height: 32px;
  }
`;

const PlaceholderText = styled.span`
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const PreviewImage = styled.img`
  display: block;
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
`;

const PreviewVideo = styled.video`
  display: block;
  max-width: 100%;
  max-height: 400px;
`;

const ChangeOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: ${({ theme }) => theme.fontSize.md};
  opacity: 0;
  transition: opacity 0.15s;

  ${Container}:hover & {
    opacity: 1;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

function isAcceptedType(file: File, accept: string[]): boolean {
  return accept.some((type) => file.type === type);
}

function isVideoType(file: File): boolean {
  return file.type.startsWith('video/');
}

export function DropZone({ value, onChange, accept }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function handleFile(file: File) {
    if (isAcceptedType(file, accept)) {
      onChange(file);
    }
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const file = e.clipboardData.files[0];
    if (file) handleFile(file);
  }

  return (
    <Container
      $dragOver={dragOver}
      $hasFile={!!value}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      data-testid="drop-zone"
    >
      <HiddenInput
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        onChange={handleInputChange}
      />
      {value && previewUrl ? (
        <>
          {isVideoType(value) ? (
            <PreviewVideo
              src={previewUrl}
              controls
              onClick={(e) => e.stopPropagation()}
              data-testid="upload-preview-video"
            />
          ) : (
            <PreviewImage
              src={previewUrl}
              alt="Preview"
              data-testid="upload-preview-image"
            />
          )}
          <ChangeOverlay>Click or drop to change</ChangeOverlay>
        </>
      ) : (
        <Placeholder>
          <UploadIcon />
          <PlaceholderText>
            Drop file here, paste, or click to browse
          </PlaceholderText>
        </Placeholder>
      )}
    </Container>
  );
}
