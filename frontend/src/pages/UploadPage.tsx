import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia } from '../api/media';
import { Button, Input, Label } from '../components';

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

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime';

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => uploadMedia(file!, name, description),
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
          <Label htmlFor="file">File</Label>
          <Input
            id="file"
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
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
        {mutation.error && <ErrorText>{mutation.error.message}</ErrorText>}
        <Button type="submit" disabled={!file} loading={mutation.isPending}>
          {mutation.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </Form>
    </Container>
  );
}
