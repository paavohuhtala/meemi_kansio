import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { deleteMedia, getMedia, regenerateThumbnail, replaceMediaFile, runOcr, setMediaTags, updateMedia, type MediaItem } from '../api/media';
import {
  Button,
  Media,
  MediaOverlay,
  TagEditor,
  AlertDialogRoot,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogCancel,
  AlertDialogAction,
  useToast,
} from '../components';
import { media as bp } from '../styles/theme';

const Container = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  ${bp.md} {
    grid-template-columns: 1fr 250px;
  }
`;

const MediaWrapper = styled.div`
  position: relative;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};

  &:hover [data-overlay],
  &:focus-within [data-overlay] {
    opacity: 1;
  }

  img, video {
    display: block;
    max-width: 100%;
    margin: 0 auto;
  }
`;

const TitleRow = styled.div<{ $editing?: boolean }>`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  border-bottom: 2px solid ${({ theme, $editing }) => $editing ? theme.colors.primary : 'transparent'};
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xl};
  margin: 0;
  overflow-wrap: anywhere;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const Placeholder = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TitleInput = styled.input`
  all: unset;
  font-size: inherit;
  font-weight: inherit;
  color: ${({ theme }) => theme.colors.text};
  width: 100%;

  &:focus-visible {
    outline: none;
  }
`;

const Description = styled.textarea<{ $editing: boolean }>`
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  outline: none;
  font: inherit;
  display: block;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme, $editing }) => $editing ? theme.colors.text : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme, $editing }) => $editing ? theme.colors.primary : 'transparent'};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  field-sizing: content;
  cursor: ${({ $editing }) => $editing ? 'text' : 'pointer'};
  resize: ${({ $editing }) => $editing ? 'vertical' : 'none'};

  ${({ $editing, theme }) => !$editing && `
    &:hover {
      color: ${theme.colors.primaryHover};
    }
  `}

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const SectionLabel = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Meta = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const HiddenInput = styled.input`
  display: none;
`;

const TagPanel = styled.div``;

export function MediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOcrText, setEditOcrText] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingOcrText, setEditingOcrText] = useState(false);

  const { data: media, isLoading, error } = useQuery({
    queryKey: ['media', id],
    queryFn: () => getMedia(id!),
    enabled: !!id,
  });

  const metaMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; ocr_text?: string }) =>
      updateMedia(id!, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['media', id] });
      const prev = queryClient.getQueryData<MediaItem>(['media', id]);
      queryClient.setQueryData<MediaItem>(['media', id], (old) =>
        old ? { ...old, ...data } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['media', id], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
    },
  });

  const tagMutation = useMutation({
    mutationFn: (tags: string[]) => setMediaTags(id!, tags),
    onMutate: async (newTags) => {
      await queryClient.cancelQueries({ queryKey: ['media', id] });
      const prev = queryClient.getQueryData<MediaItem>(['media', id]);
      queryClient.setQueryData<MediaItem>(['media', id], (old) =>
        old ? { ...old, tags: newTags } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['media', id], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: (file: File) => replaceMediaFile(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      toast('File replaced');
    },
    onError: () => {
      toast('Failed to replace file', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMedia(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      navigate('/');
    },
  });

  const regenMutation = useMutation({
    mutationFn: () => regenerateThumbnail(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      toast('Thumbnail regenerated');
    },
    onError: () => {
      toast('Failed to regenerate thumbnail', 'error');
    },
  });

  const ocrMutation = useMutation({
    mutationFn: () => runOcr(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      toast('OCR completed');
    },
    onError: () => {
      toast('OCR failed', 'error');
    },
  });

  if (isLoading) return <Container>Loading...</Container>;
  if (error) return <Container>Failed to load media.</Container>;
  if (!media) return <Container>Not found.</Container>;

  function handleTitleClick() {
    setEditName(media!.name ?? '');
    setEditingTitle(true);
  }

  function saveTitle() {
    setEditingTitle(false);
    const trimmed = editName.trim();
    if (trimmed !== (media!.name ?? '')) {
      metaMutation.mutate({ name: trimmed });
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
    }
  }

  function handleDescriptionClick() {
    setEditDescription(media!.description ?? '');
    setEditingDescription(true);
  }

  function saveDescription() {
    setEditingDescription(false);
    const trimmed = editDescription.trim();
    if (trimmed !== (media!.description ?? '')) {
      metaMutation.mutate({ description: trimmed });
    }
  }

  function handleDescriptionKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveDescription();
    } else if (e.key === 'Escape') {
      setEditingDescription(false);
    }
  }

  function handleOcrTextClick() {
    setEditOcrText(media!.ocr_text ?? '');
    setEditingOcrText(true);
  }

  function saveOcrText() {
    setEditingOcrText(false);
    const trimmed = editOcrText.trim();
    if (trimmed !== (media!.ocr_text ?? '')) {
      metaMutation.mutate({ ocr_text: trimmed });
    }
  }

  function handleOcrTextKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveOcrText();
    } else if (e.key === 'Escape') {
      setEditingOcrText(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      replaceMutation.mutate(file);
    }
    e.target.value = '';
  }

  return (
    <Container>
      <TitleRow $editing={editingTitle}>
        {editingTitle ? (
          <Title as="label">
            <TitleInput
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={saveTitle}
              autoFocus
              data-testid="edit-name"
            />
          </Title>
        ) : (
          <Title onClick={handleTitleClick}>
            {media.name || <Placeholder>Unnamed meme</Placeholder>}
          </Title>
        )}
      </TitleRow>

      <ContentGrid>
        <MediaWrapper>
          <Media item={media} alt={media.name ?? 'Uploaded media'} controls />
          <MediaOverlay
            fileUrl={media.file_url}
            fileName={media.name ?? `media-${media.id}`}
            mediaType={media.media_type}
            clipboardUrl={media.clipboard_url}
          />
        </MediaWrapper>
        <TagPanel>
          <TagEditor
            tags={media.tags}
            onSave={(tags) => tagMutation.mutate(tags)}
          />
        </TagPanel>
      </ContentGrid>

      <Description
        $editing={editingDescription}
        value={editingDescription ? editDescription : (media.description ?? '')}
        rows={(editingDescription ? editDescription : (media.description ?? '')).split('\n').length}
        placeholder="Click to add a description"
        readOnly={!editingDescription}
        onClick={!editingDescription ? handleDescriptionClick : undefined}
        onChange={editingDescription ? (e) => setEditDescription(e.target.value) : undefined}
        onKeyDown={editingDescription ? handleDescriptionKeyDown : undefined}
        onBlur={editingDescription ? saveDescription : undefined}
        data-testid={editingDescription ? 'edit-description' : 'description'}
      />

      <SectionLabel>Recognized text</SectionLabel>
      <Description
        $editing={editingOcrText}
        value={editingOcrText ? editOcrText : (media.ocr_text ?? '')}
        rows={(editingOcrText ? editOcrText : (media.ocr_text ?? '')).split('\n').length}
        placeholder="No text recognized"
        readOnly={!editingOcrText}
        onClick={!editingOcrText ? handleOcrTextClick : undefined}
        onChange={editingOcrText ? (e) => setEditOcrText(e.target.value) : undefined}
        onKeyDown={editingOcrText ? handleOcrTextKeyDown : undefined}
        onBlur={editingOcrText ? saveOcrText : undefined}
        data-testid={editingOcrText ? 'edit-ocr-text' : 'ocr-text'}
      />

      <Meta>
        Uploaded {new Date(media.created_at).toLocaleDateString()}
      </Meta>

      <Actions>
        <Button
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          loading={replaceMutation.isPending}
          data-testid="replace-file"
        >
          Replace file
        </Button>
        <HiddenInput
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept="image/*,video/*"
        />
        <Button
          onClick={() => regenMutation.mutate()}
          loading={regenMutation.isPending}
          data-testid="regenerate-thumbnail"
        >
          Regenerate thumbnail
        </Button>
        <Button
          onClick={() => ocrMutation.mutate()}
          loading={ocrMutation.isPending}
          data-testid="run-ocr"
        >
          Run OCR
        </Button>
        <AlertDialogRoot>
          <AlertDialogTrigger asChild>
            <Button variant="danger" data-testid="delete-button">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogOverlay />
            <AlertDialogContent>
              <AlertDialogTitle>Delete media</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this? This cannot be undone.
              </AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogCancel asChild>
                  <Button variant="ghost" data-testid="delete-cancel">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="danger"
                    onClick={() => deleteMutation.mutate()}
                    loading={deleteMutation.isPending}
                    data-testid="delete-confirm"
                  >
                    Delete
                  </Button>
                </AlertDialogAction>
              </AlertDialogActions>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
      </Actions>
    </Container>
  );
}
