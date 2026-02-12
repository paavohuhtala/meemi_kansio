import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia } from '../api/media';
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

export function UploadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(() => {
    const stateFile = (location.state as { file?: File } | null)?.file;
    return stateFile instanceof File ? stateFile : null;
  });

  const mutation = useMutation({
    mutationFn: () => uploadMedia(file!, nameFromFile(file!)),
    onSuccess: (media) => navigate(`/media/${media.id}`),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (file) mutation.mutate();
  }

  return (
    <Container>
      <Heading>Upload</Heading>
      <Form onSubmit={handleSubmit}>
        <DropZone value={file} onChange={setFile} accept={ACCEPTED_TYPES} />
        {mutation.error && <ErrorText>{mutation.error.message}</ErrorText>}
        <Button type="submit" disabled={!file} loading={mutation.isPending}>
          {mutation.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </Form>
    </Container>
  );
}
