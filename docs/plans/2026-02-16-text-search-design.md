# Text Search Design

**Goal:** Let users search media by free text, matching against name, description, and OCR text. Uses PostgreSQL full-text search with relevance ranking.

**Approach:** PostgreSQL tsvector + GIN index with `simple` (language-agnostic) config. Relevance-ranked results when searching, offset pagination. Existing cursor pagination unchanged when not searching.

## Database

Add a `search_vector tsvector` column to `media`, maintained by a trigger on `name`, `description`, and `ocr_text`. GIN index for fast `@@` queries. Backfill existing rows.

```sql
ALTER TABLE media ADD COLUMN search_vector tsvector;

UPDATE media SET search_vector =
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ocr_text, ''));

CREATE INDEX idx_media_search_vector ON media USING GIN (search_vector);

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

Uses `simple` config (no stemming, works with any language). Per-media language config is a future enhancement.

## Backend

Add `search: Option<String>` and `offset: Option<i64>` to `ListMediaParams`.

When `search` is present:
- Filter with `AND search_vector @@ websearch_to_tsquery('simple', $N)`
- Order by `ts_rank(search_vector, websearch_to_tsquery('simple', $N)) DESC, created_at DESC`
- Use offset pagination instead of cursor

`websearch_to_tsquery` supports natural query syntax: `cat dog` (AND), `cat OR dog`, `"exact phrase"`, `-excluded`.

Response gains `next_offset: Option<i64>` alongside existing `next_cursor`:

```rust
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    offset: Option<i64>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,
    search: Option<String>,
}

pub struct MediaListResponse {
    pub items: Vec<MediaResponse>,
    pub next_cursor: Option<DateTime<Utc>>,
    pub next_offset: Option<i64>,
}
```

## Frontend

**Search input:** Text input in the existing `FilterRow`, before the tag input. Search icon, "Search..." placeholder. Same height as type filter buttons.

**Debouncing:** Local state for the input value. `useEffect` with 300ms debounce (via `es-toolkit`) syncs to URL `?search=` param. Initializes from URL on mount.

**API client:** `listMedia` gets `search?: string`. Sends `?search=...` and uses `offset` instead of `cursor` when searching.

**React Query:** Query key includes `search`. `useInfiniteQuery` handles dual pagination — `pageParam` is `string | undefined`, stringified offset when searching, cursor string when browsing. `getNextPageParam` reads `next_offset` or `next_cursor` based on which is present.

**URL state:** `?search=cat+meme` alongside existing `?tags=...&type=...`.

## E2E Testing

New `frontend/e2e/tests/search.test.ts`. Add `searchInput` locator and `search(query)` method to `BrowsePage` POM.

Tests:
1. Search input is visible on browse page
2. Search filters results by name
3. Search filters results by description
4. Search filters results by OCR text (using `ocr_test.png`)
5. Search combines with type filter
6. Search combines with tag filter
7. Search persists in URL on reload
8. Clearing search shows all results
9. No results shows empty state message
