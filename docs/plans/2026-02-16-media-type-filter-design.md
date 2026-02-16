# Media Type Filter

Filter media on the browse page by type: All (default), Pictures, GIFs, Videos.

## Backend

Add optional `media_type` query parameter to `GET /api/media`.

```rust
struct ListMediaParams {
    cursor: Option<DateTime<Utc>>,
    limit: Option<i64>,
    tags: Option<String>,
    media_type: Option<MediaType>,  // "image", "video", or "gif"
}
```

Both SQL query branches (with-tags and without-tags) get an additional `AND media_type = $x` clause when the parameter is present. No new migration needed. Invalid values are rejected as 400 automatically via `MediaType` deserialization.

## Frontend

### URL state

New `type` search param: `/?type=video`, `/?type=gif`, `/?type=image`. Absent means "all". Combines with tags via AND logic: `/?type=video&tags=cats`.

### API client

`listMedia()` gets an optional `mediaType` parameter, appended as `&type=image` to the query string.

### React Query

Query key becomes `['media-list', { tags: filterTags, type: filterType }]` so changing the filter automatically refetches.

### UI

The FilterBar becomes a flex row. Four pill-style toggle buttons (All | Pictures | GIFs | Videos) sit inline with the TagInput on desktop. On narrow screens the row wraps so buttons drop below the input.

Active button gets highlighted style (primary color), inactive buttons are subtle. Clicking updates the `?type=` param (or removes it for "All") and triggers a refetch.

Empty state message updated to be generic: "No media matches the selected filters."

## E2E Testing

Upload mixed media types (image + video from `test_data/`), then verify:

- "All" shows both items
- "Pictures" shows only the image
- "Videos" shows only the video
- Filter state persists in URL

Add type filter methods to the HomePage page object. Tests use the POM pattern via Playwright fixtures.
