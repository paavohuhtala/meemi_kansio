import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { deleteMedia, getMedia, replaceMediaFile, setMediaTags, updateMedia } from '../api/media';
import {
  Button,
  Input,
  Media,
  MediaOverlay,
  TagInput,
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
} from '../components';
import { media as bp } from '../styles/theme';

const Container = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
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

  &:hover [data-overlay] {
    opacity: 1;
  }

  img, video {
    display: block;
    max-width: 100%;
    margin: 0 auto;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xl};
  margin-bottom: 0;
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
  font-size: ${({ theme }) => theme.fontSize.xl};
  font-weight: bold;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 2px solid ${({ theme }) => theme.colors.primary};
  padding-bottom: 2px;
  width: 100%;
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const DescriptionTextarea = styled.textarea`
  all: unset;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 2px solid ${({ theme }) => theme.colors.primary};
  padding-bottom: 2px;
  width: 100%;
  min-height: 60px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  resize: vertical;
`;

const Meta = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const HiddenInput = styled.input`
  display: none;
`;

const TagPanel = styled.div``;

const EditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const EditActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

export function MediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);

  const { data: media, isLoading, error } = useQuery({
    queryKey: ['media', id],
    queryFn: () => getMedia(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string; tags: string[] }) => {
      const { tags, ...meta } = data;
      await updateMedia(id!, meta);
      await setMediaTags(id!, tags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      setEditing(false);
    },
  });

  const metaMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      updateMedia(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
    },
  });

  const tagMutation = useMutation({
    mutationFn: (tags: string[]) => setMediaTags(id!, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: (file: File) => replaceMediaFile(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', id] });
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMedia(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      navigate('/');
    },
  });

  if (isLoading) return <Container>Loading...</Container>;
  if (error) return <Container>Failed to load media.</Container>;
  if (!media) return <Container>Not found.</Container>;

  function startEditing() {
    setEditName(media!.name ?? '');
    setEditDescription(media!.description ?? '');
    setEditing(true);
  }

  function handleSave() {
    updateMutation.mutate({
      name: editName,
      description: editDescription,
      tags: media!.tags,
    });
  }

  function handleCancel() {
    setEditing(false);
  }

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      replaceMutation.mutate(file);
    }
    e.target.value = '';
  }

  return (
    <Container>
      <Header>
        {editingTitle ? (
          <TitleInput
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            autoFocus
            data-testid="edit-name"
          />
        ) : (
          <Title onClick={handleTitleClick}>
            {media.name || <Placeholder>Unnamed meme</Placeholder>}
          </Title>
        )}
        <HeaderActions>
          {!editing && (
            <Button variant="ghost" onClick={startEditing} data-testid="edit-button">
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
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
        </HeaderActions>
      </Header>

      {editing && (
        <EditForm>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
          />
          <Input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description"
          />
          <EditActions>
            <Button
              onClick={handleSave}
              loading={updateMutation.isPending}
              data-testid="save-edit"
            >
              Save
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </EditActions>
        </EditForm>
      )}

      <ContentGrid>
        <MediaWrapper>
          <Media item={media} alt={media.name ?? 'Uploaded media'} controls />
          <MediaOverlay
            fileUrl={media.file_url}
            fileName={media.name ?? `media-${media.id}`}
            mediaType={media.media_type}
          />
        </MediaWrapper>
        {!editing && (
          <TagPanel data-testid="tag-list">
            <TagInput
              tags={media.tags}
              onChange={(tags) => tagMutation.mutate(tags)}
              placeholder="Click to add tags"
            />
          </TagPanel>
        )}
      </ContentGrid>

      {!editing && (
        editingDescription ? (
          <DescriptionTextarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            onKeyDown={handleDescriptionKeyDown}
            onBlur={saveDescription}
            autoFocus
            data-testid="edit-description"
          />
        ) : (
          <Description onClick={handleDescriptionClick} data-testid="description">
            {media.description || <Placeholder>Click to add a description</Placeholder>}
          </Description>
        )
      )}

      <Meta>
        Uploaded {new Date(media.created_at).toLocaleDateString()}
      </Meta>
    </Container>
  );
}
