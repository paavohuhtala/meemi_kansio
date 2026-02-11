import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { deleteMedia, getMedia, replaceMediaFile, updateMedia } from '../api/media';
import {
  Button,
  Input,
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
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};

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

export function MediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: media, isLoading, error } = useQuery({
    queryKey: ['media', id],
    queryFn: () => getMedia(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      updateMedia(id!, data),
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

  const isVideo = media.media_type === 'video';

  function startEditing() {
    setEditName(media!.name ?? '');
    setEditDescription(media!.description ?? '');
    setEditing(true);
  }

  function handleSave() {
    updateMutation.mutate({
      name: editName,
      description: editDescription,
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
        {isVideo ? (
          <video src={media.file_url} controls />
        ) : (
          <img src={media.file_url} alt={media.name ?? 'Uploaded media'} />
        )}
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
