# Media Type Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users filter media on the browse page by type (All / Pictures / GIFs / Videos).

**Architecture:** Server-side filtering via a new `media_type` query parameter on `GET /api/media`. The backend adds a `WHERE media_type = $x` clause. The frontend adds pill toggle buttons inline with the tag filter, persisting the selection in the URL as `?type=image|video|gif`.

**Tech Stack:** Rust/Axum (backend), React/TypeScript/styled-components (frontend), Playwright (e2e)

---

## Task 1: Backend — Add `media_type` query parameter

**Files:**
- Modify: `backend/src/routes/media.rs:770-848`

**Step 1: Add `media_type` field to `ListMediaParams`**

At `backend/src/routes/media.rs:770-775`, change:

```rust
#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
}
```

To:

```rust
#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,
}
```

Add `use crate::models::media::MediaType;` to the imports at the top of the file if not already present.

**Step 2: Update the SQL queries to filter by media_type**

The `list_media` function has 4 SQL query branches (tags/no-tags x cursor/no-cursor). Each needs an optional `AND media_type = $N` clause.

Replace the entire query section (lines 795-848) with a dynamic query builder approach. Replace from `let rows = if tag_filter.is_empty() {` through the closing `};` of the `rows` assignment with:

```rust
    let rows = if tag_filter.is_empty() {
        let mut sql = String::from("SELECT * FROM media WHERE 1=1");
        if params.media_type.is_some() {
            sql.push_str(" AND media_type = $1");
        }
        if params.cursor.is_some() {
            let n = if params.media_type.is_some() { "$2" } else { "$1" };
            sql.push_str(&format!(" AND created_at < {n}"));
        }
        let limit_n = match (params.media_type.is_some(), params.cursor.is_some()) {
            (true, true) => "$3",
            (true, false) | (false, true) => "$2",
            (false, false) => "$1",
        };
        sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {limit_n}"));

        let mut q = sqlx::query_as::<_, Media>(&sql);
        if let Some(ref mt) = params.media_type {
            q = q.bind(mt);
        }
        if let Some(cursor) = params.cursor {
            q = q.bind(cursor);
        }
        q = q.bind(limit + 1);
        q.fetch_all(&state.db).await?
    } else {
        let tag_count = tag_filter.len() as i64;
        // $1 = tags array, next params are dynamic
        let mut next_param = 2;
        let mut extra_where = String::new();
        if params.media_type.is_some() {
            extra_where.push_str(&format!(" AND m.media_type = ${next_param}"));
            next_param += 1;
        }
        if params.cursor.is_some() {
            extra_where.push_str(&format!(" AND m.created_at < ${next_param}"));
            next_param += 1;
        }
        let sql = format!(
            "SELECT m.* FROM media m
             JOIN media_tags mt ON mt.media_id = m.id
             JOIN tags t ON t.id = mt.tag_id
             WHERE t.name = ANY($1){extra_where}
             GROUP BY m.id
             HAVING COUNT(DISTINCT t.name) = ${next_param}
             ORDER BY m.created_at DESC
             LIMIT ${}", next_param + 1
        );

        let mut q = sqlx::query_as::<_, Media>(&sql);
        q = q.bind(&tag_filter);
        if let Some(ref mt) = params.media_type {
            q = q.bind(mt);
        }
        if let Some(cursor) = params.cursor {
            q = q.bind(cursor);
        }
        q = q.bind(tag_count);
        q = q.bind(limit + 1);
        q.fetch_all(&state.db).await?
    };
```

**Step 3: Verify it compiles**

Run: `cargo check` from `backend/`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add backend/src/routes/media.rs
git commit -m "feat: add media_type filter to list media endpoint"
```

---

## Task 2: Frontend API client — Add `mediaType` parameter

**Files:**
- Modify: `frontend/src/api/media.ts:44-50`

**Step 1: Update `listMedia` function**

Change:

```typescript
export function listMedia(cursor?: string, tags?: string[]) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}
```

To:

```typescript
export type MediaTypeFilter = 'image' | 'video' | 'gif';

export function listMedia(cursor?: string, tags?: string[], mediaType?: MediaTypeFilter) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  if (mediaType) params.set('media_type', mediaType);
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/media.ts
git commit -m "feat: add mediaType param to listMedia API function"
```

---

## Task 3: Frontend UI — Type filter buttons on HomePage

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`

**Step 1: Add the TypeFilterButton styled components**

After the existing `FilterBar` styled component (line 12-15), add:

```typescript
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
```

Remove the old `FilterBar` styled component (it's replaced by `FilterRow`).

**Step 2: Add `mediaType` import and URL state management**

Update the import from `../api/media`:

```typescript
import { listMedia, type MediaItem, type MediaTypeFilter } from '../api/media';
```

Inside the `HomePage` component, after the `filterTags` / `setFilterTags` block, add:

```typescript
  const filterType = (searchParams.get('type') as MediaTypeFilter) || undefined;

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
```

**Step 3: Update the query key and queryFn**

Change the `useInfiniteQuery` call:

```typescript
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
```

**Step 4: Update the JSX — replace FilterBar with FilterRow**

Replace the `<FilterBar>` section in the return JSX:

```tsx
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
```

**Step 5: Update the empty state message**

Change:

```tsx
      {items.length === 0 && filterTags.length > 0 && (
        <EmptyState>
          <p>No media matches the selected tags.</p>
        </EmptyState>
      )}
```

To:

```tsx
      {items.length === 0 && (filterTags.length > 0 || filterType) && (
        <EmptyState>
          <p>No media matches the selected filters.</p>
        </EmptyState>
      )}
```

**Step 6: Verify it compiles**

Run: `pnpm exec tsc --noEmit` from `frontend/`
Expected: No type errors.

**Step 7: Commit**

```bash
git add frontend/src/pages/HomePage.tsx
git commit -m "feat: add media type filter buttons to browse page"
```

---

## Task 4: E2E — Update BrowsePage POM

**Files:**
- Modify: `frontend/e2e/pom/BrowsePage.ts`

**Step 1: Add type filter locators and methods**

Add these fields to the class (after existing `readonly` fields):

```typescript
  readonly typeFilterAll: Locator;
  readonly typeFilterPictures: Locator;
  readonly typeFilterGifs: Locator;
  readonly typeFilterVideos: Locator;
```

Add assignments in the constructor (after existing assignments):

```typescript
    this.typeFilterAll = page.getByTestId('type-filter-all');
    this.typeFilterPictures = page.getByTestId('type-filter-image');
    this.typeFilterGifs = page.getByTestId('type-filter-gif');
    this.typeFilterVideos = page.getByTestId('type-filter-video');
```

Update the `noMatchText` locator to match the new generic message:

```typescript
    this.noMatchText = page.getByText('No media matches the selected filters');
```

**Step 2: Commit**

```bash
git add frontend/e2e/pom/BrowsePage.ts
git commit -m "feat: add type filter locators to BrowsePage POM"
```

---

## Task 5: E2E — Write media type filter tests

**Files:**
- Create: `frontend/e2e/tests/type-filter.test.ts`

**Step 1: Write the test file**

```typescript
import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ registerPage, page }) => {
  await registerPage.register('filterer', 'password123');
  await page.waitForURL('/');
});

e2eTest('type filter buttons are visible on browse page', async ({ browsePage }) => {
  await browsePage.goto();

  await expect(browsePage.typeFilterAll).toBeVisible();
  await expect(browsePage.typeFilterPictures).toBeVisible();
  await expect(browsePage.typeFilterGifs).toBeVisible();
  await expect(browsePage.typeFilterVideos).toBeVisible();
});

e2eTest('filter by pictures shows only images', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=image/);
});

e2eTest('filter by videos shows only videos', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=video/);
});

e2eTest('filter by GIFs shows only GIFs', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('questionable_ethics.gif');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterGifs.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=gif/);
});

e2eTest('All filter shows everything', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);

  await browsePage.typeFilterAll.click();
  await expect(browsePage.gridItems).toHaveCount(2);
  await expect(page).not.toHaveURL(/type=/);
});

e2eTest('type filter persists in URL on page reload', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);

  await page.reload();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=video/);
});

e2eTest('type filter combines with tag filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  // Upload image with tag
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.setTags(['funny']);

  // Upload video with same tag
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);
  await mediaPage.setTags(['funny']);

  // Upload image without tag
  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(3);

  // Filter by tag only
  await browsePage.filterByTag('funny');
  await expect(browsePage.gridItems).toHaveCount(2);

  // Filter by tag + type
  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=image/);
  await expect(page).toHaveURL(/tags=funny/);
});
```

**Step 2: Run the tests**

Run: `pnpm test:e2e --grep "type filter"` from `frontend/`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add frontend/e2e/tests/type-filter.test.ts
git commit -m "test: add e2e tests for media type filter"
```
