# Tag Editor Redesign

## Goal

Replace the current inline `TagInput` on the media detail page with a Trello-style `TagEditor` that uses batched save/cancel instead of immediate mutations, and provides clearer feedback about pending changes and new tags.

## Architecture

New `TagEditor` component in `frontend/src/components/TagEditor.tsx`, used only on the media detail page. The existing `TagInput` stays unchanged for the browse page filter and upload form — different semantics (immediate filter vs. batched edit) warrant separate components.

## Component

### Props

```ts
interface TagEditorProps {
  tags: string[];                    // current saved tags from server
  onSave: (tags: string[]) => void;  // called with final tag list on save
}
```

### Internal State

- `draftTags: string[]` — working copy, initialized from `tags` prop
- `removedTags: Set<string>` — original tags pending removal (for strikethrough)
- `newTags: Set<string>` — tags not yet in the system (for "new" indicator)
- `inputValue: string` — text in the add-tag input
- `showInput: boolean` — whether the add-tag input is visible

### Dirty Detection

Compare effective tags (`draftTags` excluding `removedTags`) against `tags` prop. Show Save/Cancel buttons only when dirty.

## Visual States

### Default (clean)

```
[funny] [classic] [memes]     [+ Add tag]
```

Chips with X buttons always visible. "+ Add tag" button at the end of the row.

### After removing a tag (dirty)

```
[funny] [c̶l̶a̶s̶s̶i̶c̶] [memes]     [+ Add tag]
                                [Save] [Cancel]
```

Removed chip: dimmed text, strikethrough, no X button. Clicking the dimmed chip restores it (undo). Save/Cancel appear below the tag row.

### Add-tag input open

```
[funny] [c̶l̶a̶s̶s̶i̶c̶] [memes]     [type to search... ]
                                [Save] [Cancel]
```

"+ Add tag" button replaced by inline text input with autocomplete dropdown. Enter or clicking a suggestion adds the tag and keeps input open. Escape or click-outside closes the input, restoring the button.

### Autocomplete dropdown

```
[type to search...    ]
+-----------------------+
| funny-cats            |  <- existing tag
| funny-dogs            |  <- existing tag
| Create "funnybone"    |  <- new tag (no exact match)
+-----------------------+
```

Uses existing `searchTags` API with 200ms debounce. Tags already in the draft are excluded. "Create X" item appears when typed text doesn't exactly match any suggestion. Keyboard navigation: Arrow up/down, Enter to select.

### Newly added tags

```
[funny] [c̶l̶a̶s̶s̶i̶c̶] [memes] [funnybone *new]     [+ Add tag]
                                                  [Save] [Cancel]
```

Tags added via "Create X" get a small "new" label. Tags added by selecting an existing suggestion do not. This is purely cosmetic — the backend handles creating new tags on PUT.

## Integration with MediaPage

Replace:

```tsx
<TagInput
  tags={media.tags}
  onChange={(tags) => tagMutation.mutate(tags)}
  placeholder="Click to add tags"
/>
```

With:

```tsx
<TagEditor
  tags={media.tags}
  onSave={(tags) => tagMutation.mutate(tags)}
/>
```

The existing `tagMutation` with optimistic updates stays as-is. Only difference: fires on explicit save instead of every change.

### Edge case: server sync during edit

If the `tags` prop changes while the user has unsaved edits, the draft is not reset — the user's pending changes take priority. Save overwrites with the confirmed set (consistent with PUT semantics).

## E2E Test Updates

### MediaPage POM

Add high-level methods that encapsulate the new interaction flow:

- `addTag(name: string)` — clicks "+ Add tag", types, presses Enter, closes input
- `removeTag(name: string)` — clicks X on the named chip
- `saveTags()` — clicks Save button
- `cancelTagEdit()` — clicks Cancel button
- `editTags({ add?: string[], remove?: string[] })` — convenience method that adds/removes multiple tags and saves

New locators:

- `addTagButton` — the "+ Add tag" button
- `addTagInput` — the text input inside the add-tag popover
- `saveTagsButton` / `cancelTagsButton`
- `tagChips` — active (non-removed) chips
- `removedTagChips` — strikethrough chips

### Test changes

- "edit tags on detail page": use `editTags({ remove: ['original'], add: ['updated', 'new-tag'] })` instead of direct input manipulation
- "upload without tags": assert "+ Add tag" button is visible instead of empty chip count
