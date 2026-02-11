import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { getMedia } from '../api/media';

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

export function MediaPage() {
  const { id } = useParams<{ id: string }>();
  const { data: media, isLoading, error } = useQuery({
    queryKey: ['media', id],
    queryFn: () => getMedia(id!),
    enabled: !!id,
  });

  if (isLoading) return <Container>Loading...</Container>;
  if (error) return <Container>Failed to load media.</Container>;
  if (!media) return <Container>Not found.</Container>;

  const isVideo = media.media_type === 'video';

  return (
    <Container>
      <MediaWrapper>
        {isVideo ? (
          <video src={media.file_url} controls />
        ) : (
          <img src={media.file_url} alt={media.name ?? 'Uploaded media'} />
        )}
      </MediaWrapper>
      {media.name && <Title>{media.name}</Title>}
      {media.description && <Description>{media.description}</Description>}
      <Meta>
        Uploaded {new Date(media.created_at).toLocaleDateString()}
      </Meta>
    </Container>
  );
}
