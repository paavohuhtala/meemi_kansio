import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { listMedia, type MediaItem } from '../api/media';
import { MediaOverlay } from '../components';
import { media as bp } from '../styles/theme';

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Grid = styled.div`
  column-count: 1;
  column-gap: ${({ theme }) => theme.spacing.md};

  ${bp.md} {
    column-count: 2;
  }

  ${bp.lg} {
    column-count: 3;
  }

  ${bp.xl} {
    column-count: 4;
  }
`;

const Card = styled(Link)`
  display: block;
  break-inside: avoid;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  position: relative;

  &:hover [data-overlay] {
    opacity: 1;
  }
`;

const CardMedia = styled.div<{ $ratio?: string }>`
  aspect-ratio: ${({ $ratio }) => $ratio ?? '16 / 9'};
  overflow: hidden;

  img,
  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const NameOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
  font-size: ${({ theme }) => theme.fontSize.sm};
  opacity: 0;
  transition: opacity 0.15s;
`;

const PlayIcon = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.sm};
  right: ${({ theme }) => theme.spacing.sm};
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: '';
    display: block;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 5px 0 5px 9px;
    border-color: transparent transparent transparent #fff;
    margin-left: 2px;
  }
`;

const Sentinel = styled.div`
  height: 1px;
`;

const LoadingText = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxl};
  color: ${({ theme }) => theme.colors.textSecondary};

  a {
    color: ${({ theme }) => theme.colors.primary};
    &:hover {
      color: ${({ theme }) => theme.colors.primaryHover};
    }
  }
`;

function aspectRatio(item: MediaItem): string | undefined {
  if (item.width && item.height) {
    return `${item.width} / ${item.height}`;
  }
  return undefined;
}

export function HomePage() {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['media-list'],
      queryFn: ({ pageParam }) => listMedia(pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <LoadingText>Loading...</LoadingText>;

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <EmptyState>
        <p>No uploads yet.</p>
        <p>
          <Link to="/upload">Upload something</Link> to get started.
        </p>
      </EmptyState>
    );
  }

  return (
    <Container>
      <Grid data-testid="media-grid">
        {items.map((item) => (
          <Card key={item.id} to={`/media/${item.id}`}>
            <CardMedia $ratio={aspectRatio(item)}>
              {item.media_type === 'video' ? (
                <video src={item.file_url} preload="metadata" />
              ) : (
                <img
                  src={item.file_url}
                  alt={item.name ?? ''}
                  loading="lazy"
                />
              )}
            </CardMedia>
            {item.media_type === 'video' && <PlayIcon />}
            <MediaOverlay
              fileUrl={item.file_url}
              fileName={item.name ?? `media-${item.id}`}
              mediaType={item.media_type}
            />
            {item.name && <NameOverlay data-overlay>{item.name}</NameOverlay>}
          </Card>
        ))}
      </Grid>
      <Sentinel ref={sentinelRef} />
      {isFetchingNextPage && <LoadingText>Loading more...</LoadingText>}
    </Container>
  );
}
