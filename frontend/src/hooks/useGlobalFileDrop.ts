import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function isAcceptedType(file: File, accept: string[]): boolean {
  return accept.some((type) => file.type === type);
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return el.type !== 'file';
  if (el instanceof HTMLTextAreaElement) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useGlobalFileDrop(acceptedTypes: string[]) {
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const counterRef = useRef(0);

  const isUploadPage = location.pathname === '/upload';

  const handleFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((f) => isAcceptedType(f, acceptedTypes));
      if (accepted.length > 0) {
        navigate('/upload', { state: { files: accepted } });
      }
    },
    [acceptedTypes, navigate],
  );

  useEffect(() => {
    if (isUploadPage) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        counterRef.current++;
        setIsDragging(true);
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      counterRef.current--;
      if (counterRef.current <= 0) {
        counterRef.current = 0;
        setIsDragging(false);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      counterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFiles(Array.from(files));
      }
    }

    function handlePaste(e: ClipboardEvent) {
      if (isTextInput(document.activeElement)) return;
      const file = e.clipboardData?.files[0];
      if (file && isAcceptedType(file, acceptedTypes)) {
        e.preventDefault();
        handleFiles([file]);
      }
    }

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('paste', handlePaste);
      counterRef.current = 0;
    };
  }, [isUploadPage, handleFiles, acceptedTypes]);

  return { isDragging };
}
