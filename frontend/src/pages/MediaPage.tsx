import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const MediaWrapper = styled.div`
  position: relative;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Meta = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const ActionBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

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

const HiddenInput = styled.input`
  display: none;
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TagChip = styled(Link)`
  display: inline-block;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

export function MediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

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
    setEditTags([...media!.tags]);
    setEditing(true);
  }

  function handleSave() {
    updateMutation.mutate({
      name: editName,
      description: editDescription,
      tags: editTags,
    });
  }

  function handleCancel() {
    setEditing(false);
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
      <MediaWrapper>
        <Media item={media} alt={media.name ?? 'Uploaded media'} controls />
        <MediaOverlay
          fileUrl={media.file_url}
          fileName={media.name ?? `media-${media.id}`}
          mediaType={media.media_type}
        />
      </MediaWrapper>

      {editing ? (
        <EditForm>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
            data-testid="edit-name"
          />
          <Input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description"
            data-testid="edit-description"
          />
          <TagInput tags={editTags} onChange={setEditTags} placeholder="Add tags" />
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
      ) : (
        <>
          {media.name && <Title>{media.name}</Title>}
          {media.description && <Description>{media.description}</Description>}
          {media.tags.length > 0 && (
            <TagList data-testid="tag-list">
              {media.tags.map((tag) => (
                <TagChip key={tag} to={`/?tags=${encodeURIComponent(tag)}`}>
                  {tag}
                </TagChip>
              ))}
            </TagList>
          )}
        </>
      )}

      <Meta>
        Uploaded {new Date(media.created_at).toLocaleDateString()}
      </Meta>

      <ActionBar>
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
      </ActionBar>
    </Container>
  );
}
