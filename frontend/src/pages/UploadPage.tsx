import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia } from '../api/media';
import { Button, DropZone, Input, Label, TagInput } from '../components';

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

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Textarea = styled.textarea`
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSize.md};
  font-family: inherit;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  resize: vertical;
  min-height: 80px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
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

export function UploadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(() => {
    const stateFile = (location.state as { file?: File } | null)?.file;
    return stateFile instanceof File ? stateFile : null;
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => uploadMedia(file!, name, description, tags),
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
        <Field>
          <Label>File</Label>
          <DropZone value={file} onChange={setFile} accept={ACCEPTED_TYPES} />
        </Field>
        <Field>
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            placeholder="Give it a name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="Add a description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Tags (optional)</Label>
          <TagInput tags={tags} onChange={setTags} placeholder="Add tags" />
        </Field>
        {mutation.error && <ErrorText>{mutation.error.message}</ErrorText>}
        <Button type="submit" disabled={!file} loading={mutation.isPending}>
          {mutation.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </Form>
    </Container>
  );
}
