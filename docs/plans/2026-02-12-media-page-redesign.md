# Media Page Redesign

## Goal

Redesign the media detail page to improve usability and encourage adding metadata (name, description, tags) to memes.

## Layout

CSS Grid two-column layout with max-width 1100px.

```
+-----------------------------------------------------+
|  Title (or "Unnamed meme")        [Replace] [Delete] |
+--------------------------------+--------------------+
|                                |  Tags              |
|         Image / Video          |  [cat] [funny]     |
|                                |  TagInput          |
|                                |                    |
+--------------------------------+--------------------+
|  Description (or "Click to add a description")       |
+-----------------------------------------------------+
|  Uploaded Jan 15, 2026                               |
+-----------------------------------------------------+
```

- **Header row**: title left-aligned, action buttons (Replace file, Delete) right-aligned, full width
- **Content grid**: `grid-template-columns: 1fr 250px`, gap 24px
- **Image**: left column with copy/download hover overlay
- **Tags panel**: right column, horizontal wrapping layout (flex-wrap). Always shows `TagInput` for adding tags, with "Click to add tags" placeholder when empty
- **Description**: spans full width below the grid
- **Meta**: upload date at the bottom

### Mobile (< 768px)

Grid collapses to single column. Tags render as a compact horizontal wrapping strip between image and description.

## Inline Editing

Each metadata field is independently editable — no global edit mode or save button.

### Title
- Displays as `<h1>` with text or "Unnamed meme" placeholder
- Click to replace with `<input>`
- Enter or blur to save (calls `updateMedia`), Escape to cancel

### Description
- Displays as `<p>` with text or "Click to add a description" placeholder
- Click to replace with `<textarea>`
- Enter or blur to save (calls `updateMedia`), Escape to cancel

### Tags
- `TagInput` is always visible in the sidebar — no click-to-edit needed
- Changes save immediately per add/remove (calls `setMediaTags`)

## Actions

- **Replace file** and **Delete** buttons in top-right header toolbar
- Delete keeps the existing confirmation dialog
- Edit button is removed entirely

## E2E Test Changes

- Title editing: click title text, type into input, press Enter
- Description editing: click text, type into textarea, press Enter
- Tags: `TagInput` always visible, no edit mode toggle
- Removed selectors: `edit-button`, `save-edit`
- Kept selectors: `edit-name`, `edit-description`, `delete-button`, `delete-confirm`, `delete-cancel`, `replace-file`, `tag-list`
