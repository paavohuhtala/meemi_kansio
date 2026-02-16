import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { listMedia, type MediaItem, type MediaTypeFilter } from '../api/media';
import { MasonryGrid, Media, MediaOverlay, TagInput } from '../components';

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TagFilterWrapper = styled.div`
  flex: 1;
  min-width: 200px;
  max-width: 600px;
`;

const TypeFilterGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const TypeFilterButton = styled.button<{ $active?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.text};
  }
`;

const Card = styled.div`
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
`;

const CardLink = styled(Link)`
  display: block;
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

const CardTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
`;

const CardTag = styled(Link)<{ $active?: boolean }>`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  background: ${({ theme }) => theme.colors.bg};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 1px ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : 'transparent'};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const NameOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  padding-right: 80px;
  background: linear-gradient(rgba(0, 0, 0, 0.7), transparent);
  color: #fff;
  font-size: ${({ theme }) => theme.fontSize.sm};
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  overflow-wrap: anywhere;
`;

const PlayIcon = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.sm};
  left: ${({ theme }) => theme.spacing.sm};
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

function getItemHeight(item: MediaItem, columnWidth: number): number {
  const ratio = item.width && item.height ? item.width / item.height : 16 / 9;
  return columnWidth / ratio + (item.tags.length > 0 ? 28 : 0);
}

function getItemKey(item: MediaItem): string {
  return item.id;
}


export function HomePage() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const filterTags = useMemo(() => {
    const raw = searchParams.get('tags');
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  }, [searchParams]);

  const setFilterTags = useCallback(
    (tags: string[]) => {
      if (tags.length === 0) {
        searchParams.delete('tags');
      } else {
        searchParams.set('tags', tags.join(','));
      }
      setSearchParams(searchParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const rawType = searchParams.get('type');
  const filterType = rawType && (['image', 'video', 'gif'] as const).includes(rawType as MediaTypeFilter)
    ? (rawType as MediaTypeFilter)
    : undefined;

  const setFilterType = useCallback(
    (type: MediaTypeFilter | undefined) => {
      if (type) {
        searchParams.set('type', type);
      } else {
        searchParams.delete('type');
      }
      setSearchParams(searchParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  function tagFilterUrl(tag: string): string {
    const tags = filterTags.includes(tag) ? filterTags : [...filterTags, tag];
    const params = new URLSearchParams();
    params.set('tags', tags.join(','));
    if (filterType) params.set('type', filterType);
    return `/?${params.toString()}`;
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['media-list', { tags: filterTags, type: filterType }],
      queryFn: ({ pageParam }) =>
        listMedia(
          pageParam,
          filterTags.length > 0 ? filterTags : undefined,
          filterType,
        ),
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

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const hasFilters = filterTags.length > 0 || !!filterType;

  if (isLoading && !hasFilters) return <LoadingText>Loading...</LoadingText>;

  if (items.length === 0 && !hasFilters && !isLoading) {
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
      <FilterRow>
        <TagFilterWrapper>
          <TagInput
            tags={filterTags}
            onChange={setFilterTags}
            placeholder="Filter by tags"
          />
        </TagFilterWrapper>
        <TypeFilterGroup>
          {([undefined, 'image', 'gif', 'video'] as const).map((type) => (
            <TypeFilterButton
              key={type ?? 'all'}
              $active={filterType === type}
              onClick={() => setFilterType(type as MediaTypeFilter | undefined)}
              data-testid={`type-filter-${type ?? 'all'}`}
            >
              {type === undefined ? 'All' : type === 'image' ? 'Pictures' : type === 'gif' ? 'GIFs' : 'Videos'}
            </TypeFilterButton>
          ))}
        </TypeFilterGroup>
      </FilterRow>
      {isLoading && (
        <LoadingText>Loading...</LoadingText>
      )}
      {!isLoading && items.length === 0 && hasFilters && (
        <EmptyState>
          <p>No media matches the selected filters.</p>
        </EmptyState>
      )}
      {!isLoading && <MasonryGrid
        items={items}
        getItemHeight={getItemHeight}
        getItemKey={getItemKey}
        renderItem={(item) => (
          <Card>
            <CardLink to={`/media/${item.id}`}>
              <CardMedia $ratio={aspectRatio(item)}>
                <Media
                  item={item.thumbnail_url ? { ...item, file_url: item.thumbnail_url, media_type: 'image' as const } : item}
                  loading="lazy"
                  preload="metadata"
                />
              </CardMedia>
              {item.media_type === 'video' && <PlayIcon />}
              <MediaOverlay
                fileUrl={item.file_url}
                fileName={item.name ?? `media-${item.id}`}
                mediaType={item.media_type}
                clipboardUrl={item.clipboard_url}
              />
              {item.name && <NameOverlay data-overlay data-testid="card-name">{item.name}</NameOverlay>}
            </CardLink>
            {item.tags.length > 0 && (
              <CardTags>
                {item.tags.map((tag) => (
                  <CardTag
                    key={tag}
                    to={tagFilterUrl(tag)}
                    $active={filterTags.includes(tag)}
                    data-testid="card-tag"
                  >
                    {filterTags.length > 0 && !filterTags.includes(tag) ? `+${tag}` : tag}
                  </CardTag>
                ))}
              </CardTags>
            )}
          </Card>
        )}
        data-testid="media-grid"
      />}
      <Sentinel ref={sentinelRef} />
      {isFetchingNextPage && <LoadingText>Loading more...</LoadingText>}
    </Container>
  );
}
