import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadIcon } from '@radix-ui/react-icons';
import styled, { css } from 'styled-components';

interface DropZoneBaseProps {
  accept: string[];
}

interface DropZoneSingleProps extends DropZoneBaseProps {
  multiple?: false;
  value: File | null;
  onChange: (file: File) => void;
}

interface DropZoneMultiProps extends DropZoneBaseProps {
  multiple: true;
  value: File[];
  onChange: (files: File[]) => void;
}

type DropZoneProps = DropZoneSingleProps | DropZoneMultiProps;

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

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
  width: 100%;
`;

const FileCount = styled.span`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
`;

const FileNames = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
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

function dedupeFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map((f) => `${f.name}:${f.size}`));
  const newFiles = incoming.filter((f) => !seen.has(`${f.name}:${f.size}`));
  return [...existing, ...newFiles];
}

export function DropZone(props: DropZoneProps) {
  const { accept } = props;
  const isMulti = props.multiple === true;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Preview: show image/video for single mode OR multi mode with exactly 1 file
  const multiFiles = isMulti ? props.value : [];
  const previewFile = !isMulti ? props.value : (multiFiles.length === 1 ? multiFiles[0] : null);
  const previewUrl = useMemo(() => {
    return previewFile ? URL.createObjectURL(previewFile) : null;
  }, [previewFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFiles(fileList: FileList) {
    const accepted = Array.from(fileList).filter((f) => isAcceptedType(f, accept));
    if (accepted.length === 0) return;

    if (isMulti) {
      props.onChange(dedupeFiles(props.value, accepted));
    } else {
      props.onChange(accepted[0]);
    }
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
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
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (e.clipboardData.files.length > 0) {
      handleFiles(e.clipboardData.files);
    }
  }

  const hasFiles = isMulti ? props.value.length > 0 : !!props.value;

  return (
    <Container
      $dragOver={dragOver}
      $hasFile={hasFiles}
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
        multiple={isMulti}
      />
      {isMulti && multiFiles.length > 1 ? (
        <>
          <FileList>
            <FileCount>{multiFiles.length} {multiFiles.length === 1 ? 'file' : 'files'} selected</FileCount>
            <FileNames>
              {multiFiles.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`}>{f.name}</li>
              ))}
            </FileNames>
          </FileList>
          <ChangeOverlay>Drop to add more files</ChangeOverlay>
        </>
      ) : previewFile && previewUrl ? (
        <>
          {isVideoType(previewFile) ? (
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
            Drop files here, paste, or click to browse
          </PlaceholderText>
        </Placeholder>
      )}
    </Container>
  );
}
