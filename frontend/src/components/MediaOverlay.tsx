import { useState, type MouseEvent } from 'react';
import { CopyIcon, CheckIcon, DownloadIcon } from '@radix-ui/react-icons';
import styled from 'styled-components';

interface MediaOverlayProps {
  fileUrl: string;
  fileName: string;
  mediaType: 'image' | 'video' | 'gif';
  clipboardUrl?: string | null;
}

const Wrapper = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.sm};
  right: ${({ theme }) => theme.spacing.sm};
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
`;

const IconButton = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`;

async function copyImageToClipboard(url: string) {
  const res = await fetch(url, { credentials: 'include' });
  const blob = await res.blob();

  // Clipboard API only guarantees PNG support — convert via canvas
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  img.src = URL.createObjectURL(blob);
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/png');
  });

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob }),
  ]);
}

function downloadFile(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'download';
  a.click();
}

export function MediaOverlay({ fileUrl, fileName, mediaType, clipboardUrl }: MediaOverlayProps) {
  const [copied, setCopied] = useState(false);
  const canCopy = mediaType === 'image' || !!clipboardUrl;

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (clipboardUrl) {
        const res = await fetch(clipboardUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
        } else {
          await copyImageToClipboard(fileUrl);
        }
      } else {
        await copyImageToClipboard(fileUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silently fail
    }
  }

  function handleDownload(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    downloadFile(fileUrl, fileName);
  }

  return (
    <Wrapper data-overlay>
      {canCopy && (
        <IconButton onClick={handleCopy} title="Copy to clipboard">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      )}
      <IconButton onClick={handleDownload} title="Download">
        <DownloadIcon />
      </IconButton>
    </Wrapper>
  );
}
