# Text Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users search media by free text (name, description, OCR text) using PostgreSQL full-text search with relevance ranking.

**Architecture:** Server-side FTS via `tsvector` column + GIN index. `websearch_to_tsquery` for natural query syntax. Offset pagination when searching (ranked by relevance), cursor pagination otherwise. Frontend adds a debounced search input to the existing filter bar.

**Tech Stack:** Rust/Axum (backend), PostgreSQL 16 FTS, React/TypeScript/styled-components (frontend), es-toolkit (debounce), Playwright (e2e)

---

## Task 1: Database migration — Add search_vector column and trigger

**Files:**
- Create: `backend/migrations/20260216180000_add_search_vector.up.sql`
- Create: `backend/migrations/20260216180000_add_search_vector.down.sql`

**Step 1: Write the up migration**

```sql
-- Add tsvector column for full-text search
ALTER TABLE media ADD COLUMN search_vector tsvector;

-- Backfill existing rows
UPDATE media SET search_vector =
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ocr_text, ''));

-- GIN index for fast @@ queries
CREATE INDEX idx_media_search_vector ON media USING GIN (search_vector);

-- Trigger function to keep search_vector in sync
CREATE OR REPLACE FUNCTION media_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.ocr_text, ''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER media_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, ocr_text ON media
  FOR EACH ROW EXECUTE FUNCTION media_search_vector_update();
```

**Step 2: Write the down migration**

```sql
DROP TRIGGER IF EXISTS media_search_vector_trigger ON media;
DROP FUNCTION IF EXISTS media_search_vector_update();
DROP INDEX IF EXISTS idx_media_search_vector;
ALTER TABLE media DROP COLUMN IF EXISTS search_vector;
```

**Step 3: Run the migration**

Run: `cargo sqlx migrate run` from `backend/`
Expected: Migration applies successfully.

**Step 4: Commit**

```bash
git add backend/migrations/20260216180000_add_search_vector.up.sql backend/migrations/20260216180000_add_search_vector.down.sql
git commit -m "feat: add search_vector column with GIN index and trigger"
```

---

## Task 2: Backend — Add search and offset params to list media endpoint

**Files:**
- Modify: `backend/src/models/media.rs:56-60` (MediaListResponse)
- Modify: `backend/src/routes/media.rs:770-881` (ListMediaParams + list_media handler)

**Step 1: Add `next_offset` to `MediaListResponse`**

At `backend/src/models/media.rs:56-60`, change:

```rust
#[derive(Debug, Serialize)]
pub struct MediaListResponse {
    pub items: Vec<MediaResponse>,
    pub next_cursor: Option<DateTime<Utc>>,
}
```

To:

```rust
#[derive(Debug, Serialize)]
pub struct MediaListResponse {
    pub items: Vec<MediaResponse>,
    pub next_cursor: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_offset: Option<i64>,
}
```

**Step 2: Add `search` and `offset` to `ListMediaParams`**

At `backend/src/routes/media.rs:770-776`, change:

```rust
#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,
}
```

To:

```rust
#[derive(Debug, Deserialize)]
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    offset: Option<i64>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,
    search: Option<String>,
}
```

**Step 3: Rewrite the query section in `list_media`**

Replace the entire query section from `let rows = if tag_filter.is_empty() {` (line 796) through the closing `};` of the `rows` assignment (line 853), plus the pagination logic through the `Ok(Json(...))` return (lines 855-881), with logic that handles two modes:

**When `search` is present:** Use `websearch_to_tsquery('simple', $N)` for filtering and `ts_rank()` for ordering. Use offset pagination. Ignore `cursor`.

**When `search` is absent:** Keep the existing cursor pagination logic unchanged.

Both branches still support the existing `media_type` and `tags` filters using the `next_param` counter pattern.

The no-tags branch with search looks like:

```rust
let mut sql = String::from("SELECT * FROM media WHERE 1=1");
// ... bind media_type if present ...
// ... bind search filter ...
if params.search.is_some() {
    sql.push_str(&format!(" AND search_vector @@ websearch_to_tsquery('simple', ${next_param})"));
    let search_param = next_param;
    next_param += 1;
    // Order by relevance, then date
    sql.push_str(&format!(" ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', ${search_param})) DESC, created_at DESC"));
    // Offset pagination
    if params.offset.is_some() {
        sql.push_str(&format!(" OFFSET ${next_param}"));
        next_param += 1;
    }
} else {
    // Cursor pagination (existing logic)
    if params.cursor.is_some() {
        sql.push_str(&format!(" AND created_at < ${next_param}"));
        next_param += 1;
    }
    sql.push_str(" ORDER BY created_at DESC");
}
sql.push_str(&format!(" LIMIT ${next_param}"));
```

The tags branch needs the same pattern: add `AND m.search_vector @@ websearch_to_tsquery(...)` to the WHERE clause and switch ORDER BY / pagination based on whether search is present.

For the response, after fetching rows:

```rust
let has_more = rows.len() as i64 > limit;
let items: Vec<_> = rows.into_iter().take(limit as usize).collect();

let next_cursor = if has_more && params.search.is_none() {
    items.last().map(|m| m.created_at)
} else {
    None
};

let next_offset = if has_more && params.search.is_some() {
    Some(params.offset.unwrap_or(0) + limit)
} else {
    None
};

// ... batch-fetch tags ...

Ok(Json(MediaListResponse {
    items: /* ... */,
    next_cursor,
    next_offset,
}))
```

**Step 4: Verify it compiles**

Run: `cargo check` from `backend/`
Expected: Compiles with no errors.

**Step 5: Commit**

```bash
git add backend/src/models/media.rs backend/src/routes/media.rs
git commit -m "feat: add text search with relevance ranking to list media endpoint"
```

---

## Task 3: Frontend — Update API client for search and dual pagination

**Files:**
- Modify: `frontend/src/api/media.ts:21-24` (MediaPage interface)
- Modify: `frontend/src/api/media.ts:46-53` (listMedia function)

**Step 1: Update `MediaPage` interface**

At `frontend/src/api/media.ts:21-24`, change:

```typescript
export interface MediaPage {
  items: MediaItem[];
  next_cursor: string | null;
}
```

To:

```typescript
export interface MediaPage {
  items: MediaItem[];
  next_cursor: string | null;
  next_offset: number | null;
}
```

**Step 2: Update `listMedia` function**

At `frontend/src/api/media.ts:46-53`, change:

```typescript
export function listMedia(cursor?: string, tags?: string[], mediaType?: MediaTypeFilter) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  if (mediaType) params.set('media_type', mediaType);
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}
```

To:

```typescript
export function listMedia(
  cursor?: string,
  tags?: string[],
  mediaType?: MediaTypeFilter,
  search?: string,
  offset?: number,
) {
  const params = new URLSearchParams();
  if (search) {
    params.set('search', search);
    if (offset) params.set('offset', String(offset));
  } else {
    if (cursor) params.set('cursor', cursor);
  }
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  if (mediaType) params.set('media_type', mediaType);
  const qs = params.toString();
  return apiFetch<MediaPage>(`/media${qs ? `?${qs}` : ''}`);
}
```

Note: when `search` is present, we send `offset` instead of `cursor`. They're mutually exclusive.

**Step 3: Commit**

```bash
git add frontend/src/api/media.ts
git commit -m "feat: add search and offset params to listMedia API function"
```

---

## Task 4: Frontend — Install es-toolkit and add search input to HomePage

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`

**Step 1: Install es-toolkit**

Run: `pnpm add es-toolkit` from `frontend/`

**Step 2: Add SearchInput styled component**

After the existing `TagFilterWrapper` styled component (line 20-24), add:

```typescript
const SearchInput = styled.input`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSize.sm};
  width: 200px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
```

**Step 3: Add search state and debouncing**

Add imports:

```typescript
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { debounce } from 'es-toolkit';
```

Inside the `HomePage` component, after the `filterType` / `setFilterType` block, add:

```typescript
  const searchQuery = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(searchQuery);

  const debouncedSetSearch = useMemo(
    () =>
      debounce((value: string) => {
        if (value) {
          searchParams.set('search', value);
        } else {
          searchParams.delete('search');
        }
        setSearchParams(searchParams, { replace: true });
      }, 300),
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    debouncedSetSearch(searchInput);
    return () => debouncedSetSearch.cancel();
  }, [searchInput, debouncedSetSearch]);
```

Also sync `searchInput` when URL changes externally (e.g. browser back):

```typescript
  useEffect(() => {
    const urlSearch = searchParams.get('search') ?? '';
    if (urlSearch !== searchInput) {
      setSearchInput(urlSearch);
    }
  }, [searchParams]);
```

**Step 4: Update the query key and queryFn**

Change the `useInfiniteQuery` call:

```typescript
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['media-list', { tags: filterTags, type: filterType, search: searchQuery }],
      queryFn: ({ pageParam }) =>
        listMedia(
          searchQuery ? undefined : pageParam,
          filterTags.length > 0 ? filterTags : undefined,
          filterType,
          searchQuery || undefined,
          searchQuery && pageParam ? Number(pageParam) : undefined,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => {
        if (lastPage.next_offset != null) return String(lastPage.next_offset);
        return lastPage.next_cursor ?? undefined;
      },
    });
```

When searching: `pageParam` is a stringified offset (`"20"`, `"40"`, etc.). When browsing: `pageParam` is a cursor string (ISO date) as before.

**Step 5: Update `hasFilters` and `tagFilterUrl`**

Change `hasFilters`:

```typescript
  const hasFilters = filterTags.length > 0 || !!filterType || !!searchQuery;
```

Update `tagFilterUrl` to preserve search param:

```typescript
  function tagFilterUrl(tag: string): string {
    const tags = filterTags.includes(tag) ? filterTags : [...filterTags, tag];
    const params = new URLSearchParams();
    params.set('tags', tags.join(','));
    if (filterType) params.set('type', filterType);
    if (searchQuery) params.set('search', searchQuery);
    return `/?${params.toString()}`;
  }
```

**Step 6: Add search input to the JSX**

In the `<FilterRow>`, add the search input as the first child (before `<TagFilterWrapper>`):

```tsx
      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          data-testid="search-input"
        />
        <TagFilterWrapper>
          {/* ... existing TagInput ... */}
        </TagFilterWrapper>
        <TypeFilterGroup>
          {/* ... existing type buttons ... */}
        </TypeFilterGroup>
      </FilterRow>
```

**Step 7: Verify it compiles**

Run: `pnpm exec tsc --noEmit` from `frontend/`
Expected: No type errors.

**Step 8: Commit**

```bash
git add frontend/src/pages/HomePage.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: add debounced search input to browse page"
```

---

## Task 5: E2E — Update BrowsePage POM and write search tests

**Files:**
- Modify: `frontend/e2e/pom/BrowsePage.ts`
- Create: `frontend/e2e/tests/search.test.ts`

**Step 1: Add search locator and method to BrowsePage POM**

Add field after existing `readonly` fields:

```typescript
  readonly searchInput: Locator;
```

Add assignment in the constructor:

```typescript
    this.searchInput = page.getByTestId('search-input');
```

Add a search helper method:

```typescript
  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for debounce (300ms) + network
    await this.page.waitForResponse((res) => res.url().includes('/api/media'));
  }

  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForResponse((res) => res.url().includes('/api/media'));
  }
```

**Step 2: Write the test file**

Create `frontend/e2e/tests/search.test.ts`:

```typescript
import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ registerPage, page }) => {
  await registerPage.register('searcher', 'password123');
  await page.waitForURL('/');
});

e2eTest('search input is visible on browse page', async ({
  uploadPage,
  browsePage,
  page,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await browsePage.goto();

  await expect(browsePage.searchInput).toBeVisible();
});

e2eTest('search filters results by name', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('sugar warehouse');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('markus face');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('sugar');
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=sugar/);
});

e2eTest('search filters results by description', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editDescription('a funny meme about cats');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editDescription('a picture of a dog');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('cats');
  await expect(browsePage.gridItems).toHaveCount(1);
});

e2eTest('search combines with type filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('test item');

  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('test item');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('test');
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=test/);
  await expect(page).toHaveURL(/type=image/);
});

e2eTest('search combines with tag filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  // Upload image with name + tag
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('findme item');
  await mediaPage.editTags({ add: ['funny'] });

  // Upload image with same name, no tag
  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('findme other');

  await browsePage.goto();
  await browsePage.search('findme');
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.filterByTag('funny');
  await expect(browsePage.gridItems).toHaveCount(1);
});

e2eTest('search persists in URL on page reload', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('persistent search test');

  await browsePage.goto();
  await browsePage.search('persistent');
  await expect(browsePage.gridItems).toHaveCount(1);

  await page.reload();
  await expect(browsePage.searchInput).toHaveValue('persistent');
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=persistent/);
});

e2eTest('clearing search shows all results', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('alpha item');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('beta item');

  await browsePage.goto();
  await browsePage.search('alpha');
  await expect(browsePage.gridItems).toHaveCount(1);

  await browsePage.clearSearch();
  await expect(browsePage.gridItems).toHaveCount(2);
  await expect(page).not.toHaveURL(/search=/);
});

e2eTest('no results shows empty state', async ({
  uploadPage,
  browsePage,
  page,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.search('nonexistent');
  await expect(browsePage.noMatchText).toBeVisible();
});
```

**Step 3: Run the tests**

Run: `pnpm test:e2e --grep "search"` from `frontend/`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/e2e/pom/BrowsePage.ts frontend/e2e/tests/search.test.ts
git commit -m "test: add e2e tests for text search"
```
