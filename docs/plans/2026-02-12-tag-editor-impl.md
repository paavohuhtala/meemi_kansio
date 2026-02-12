# Tag Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the immediate-save TagInput on the media detail page with a Trello-style TagEditor that uses batched save/cancel, strikethrough for pending removals, "Create X" dropdown for new tags, and a "new" indicator on chips.

**Architecture:** New `TagEditor` component with draft state management. Tags are edited locally (add/remove) and only persisted when the user clicks Save. The existing `TagInput` stays unchanged for the browse page filter and upload form. E2e tests get high-level POM methods that encapsulate the new interaction flow.

**Tech Stack:** React, styled-components, React Query (for tag search), Playwright (e2e)

**Design doc:** `docs/plans/2026-02-12-tag-editor-design.md`

---

### Task 1: Create the TagEditor component with chip display and remove/restore

**Files:**
- Create: `frontend/src/components/TagEditor.tsx`
- Modify: `frontend/src/components/index.ts`

This task builds the chip display with remove (X button → strikethrough) and restore (click strikethrough chip → undo), plus Save/Cancel buttons that appear when dirty. No add-tag input yet.

**Implementation:**

Create `frontend/src/components/TagEditor.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import styled from 'styled-components';
import { Button } from './Button';

interface TagEditorProps {
  tags: string[];
  onSave: (tags: string[]) => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  align-items: center;
`;

const Chip = styled.span<{ $removed?: boolean; $isNew?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme, $isNew }) => $isNew ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme, $removed }) => $removed ? theme.colors.textSecondary : theme.colors.text};
  text-decoration: ${({ $removed }) => $removed ? 'line-through' : 'none'};
  cursor: ${({ $removed }) => $removed ? 'pointer' : 'default'};
  opacity: ${({ $removed }) => $removed ? 0.6 : 1};
`;

const ChipRemove = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 1px;
  border-radius: 2px;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  svg {
    width: 10px;
    height: 10px;
  }
`;

const NewBadge = styled.span`
  font-size: 0.625rem;
  color: ${({ theme }) => theme.colors.primary};
  margin-left: 2px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// ... AddTagButton, input, dropdown styles will be added in Task 2

export function TagEditor({ tags, onSave }: TagEditorProps) {
  const [draftTags, setDraftTags] = useState<string[]>(tags);
  const [removedTags, setRemovedTags] = useState<Set<string>>(new Set());
  const [newTags, setNewTags] = useState<Set<string>>(new Set());

  const effectiveTags = useMemo(
    () => draftTags.filter((t) => !removedTags.has(t)),
    [draftTags, removedTags],
  );

  const isDirty = useMemo(() => {
    if (effectiveTags.length !== tags.length) return true;
    return !effectiveTags.every((t, i) => tags.includes(t)) ||
           !tags.every((t) => effectiveTags.includes(t));
  }, [effectiveTags, tags]);

  const removeTag = useCallback((tag: string) => {
    if (newTags.has(tag)) {
      // Newly added tags just get removed entirely
      setDraftTags((prev) => prev.filter((t) => t !== tag));
      setNewTags((prev) => {
        const next = new Set(prev);
        next.delete(tag);
        return next;
      });
    } else {
      // Original tags get strikethrough
      setRemovedTags((prev) => new Set(prev).add(tag));
    }
  }, [newTags]);

  const restoreTag = useCallback((tag: string) => {
    setRemovedTags((prev) => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  }, []);

  function handleSave() {
    onSave(effectiveTags);
    // Reset draft state to match what we saved
    setDraftTags(effectiveTags);
    setRemovedTags(new Set());
    setNewTags(new Set());
  }

  function handleCancel() {
    setDraftTags(tags);
    setRemovedTags(new Set());
    setNewTags(new Set());
  }

  return (
    <Container data-testid="tag-editor">
      <ChipRow>
        {draftTags.map((tag) => {
          const isRemoved = removedTags.has(tag);
          const isNew = newTags.has(tag);
          return (
            <Chip
              key={tag}
              $removed={isRemoved}
              $isNew={isNew}
              onClick={isRemoved ? () => restoreTag(tag) : undefined}
              data-testid={isRemoved ? 'removed-tag-chip' : 'tag-chip'}
            >
              {tag}
              {isNew && <NewBadge>new</NewBadge>}
              {!isRemoved && (
                <ChipRemove
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  <Cross1Icon />
                </ChipRemove>
              )}
            </Chip>
          );
        })}
        {/* Add tag button/input will go here in Task 2 */}
      </ChipRow>
      {isDirty && (
        <ActionRow>
          <Button
            variant="primary"
            onClick={handleSave}
            data-testid="save-tags"
          >
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={handleCancel}
            data-testid="cancel-tags"
          >
            Cancel
          </Button>
        </ActionRow>
      )}
    </Container>
  );
}
```

Add the export to `frontend/src/components/index.ts`:

```ts
export { TagEditor } from './TagEditor';
```

**Verify:** Start the dev server (`pnpm dev` from `frontend/`), open a media detail page, and confirm the component compiles without errors. (Integration into MediaPage happens in Task 3, but we can verify the build.)

**Commit:**
```bash
git add frontend/src/components/TagEditor.tsx frontend/src/components/index.ts
git commit -m "feat: add TagEditor component with chip display, remove/restore, and save/cancel"
```

---

### Task 2: Add the "+ Add tag" button with autocomplete input and "Create X" support

**Files:**
- Modify: `frontend/src/components/TagEditor.tsx`

This task adds the "+ Add tag" button that toggles into an inline text input with an autocomplete dropdown. The dropdown shows existing tag suggestions (from the `searchTags` API) and a "Create X" item when the typed text doesn't exactly match.

**Implementation:**

Add these styled components to `TagEditor.tsx`:

```tsx
const AddButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  border: 1px dashed ${({ theme }) => theme.colors.border};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const InlineInput = styled.input`
  all: unset;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  min-width: 140px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Dropdown = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  list-style: none;
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surfaceHover : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`;

const CreateLabel = styled.span`
  color: ${({ theme }) => theme.colors.primary};
`;
```

Add these imports at the top:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon, Cross1Icon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { searchTags } from '../api/media';
```

Add the add-tag state and logic inside the `TagEditor` function:

```tsx
const [showInput, setShowInput] = useState(false);
const [inputValue, setInputValue] = useState('');
const [highlightIndex, setHighlightIndex] = useState(-1);
const inputRef = useRef<HTMLInputElement>(null);
const wrapperRef = useRef<HTMLDivElement>(null);

// Debounced query
const [debouncedQuery, setDebouncedQuery] = useState('');
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(inputValue), 200);
  return () => clearTimeout(timer);
}, [inputValue]);

const { data: suggestions } = useQuery({
  queryKey: ['tags', debouncedQuery],
  queryFn: () => searchTags(debouncedQuery),
  enabled: showInput && debouncedQuery.length > 0,
});

const filteredSuggestions = useMemo(
  () => suggestions?.tags.filter((t) => !draftTags.includes(t.name)) ?? [],
  [suggestions, draftTags],
);

const normalizedInput = inputValue.trim().toLowerCase();
const exactMatch = filteredSuggestions.some((t) => t.name === normalizedInput);
const showCreateOption =
  normalizedInput.length > 0 &&
  !exactMatch &&
  !draftTags.includes(normalizedInput) &&
  !normalizedInput.match(/\s/) &&
  normalizedInput.length <= 30;

function addTag(name: string, isNew: boolean) {
  const normalized = name.trim().toLowerCase();
  if (!normalized || draftTags.includes(normalized)) return;

  // If restoring a previously removed tag
  if (removedTags.has(normalized)) {
    restoreTag(normalized);
  } else {
    setDraftTags((prev) => [...prev, normalized]);
    if (isNew) {
      setNewTags((prev) => new Set(prev).add(normalized));
    }
  }
  setInputValue('');
  setHighlightIndex(-1);
  // Keep input open for adding more tags
}

function handleInputKeyDown(e: React.KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (highlightIndex >= 0 && highlightIndex < filteredSuggestions.length) {
      addTag(filteredSuggestions[highlightIndex].name, false);
    } else if (showCreateOption) {
      addTag(normalizedInput, true);
    } else if (normalizedInput && !showCreateOption && filteredSuggestions.length > 0) {
      addTag(filteredSuggestions[0].name, false);
    }
  } else if (e.key === 'Escape') {
    setShowInput(false);
    setInputValue('');
    setHighlightIndex(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const maxIndex = filteredSuggestions.length + (showCreateOption ? 1 : 0) - 1;
    setHighlightIndex((i) => (i < maxIndex ? i + 1 : i));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
  }
}

// Close input when clicking outside
useEffect(() => {
  if (!showInput) return;
  function handleClick(e: MouseEvent) {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
      setShowInput(false);
      setInputValue('');
      setHighlightIndex(-1);
    }
  }
  document.addEventListener('mousedown', handleClick);
  return () => document.removeEventListener('mousedown', handleClick);
}, [showInput]);

// Auto-focus input when it appears
useEffect(() => {
  if (showInput) {
    inputRef.current?.focus();
  }
}, [showInput]);
```

In the JSX `ChipRow`, after the tag chips, add:

```tsx
{showInput ? (
  <InputWrapper ref={wrapperRef}>
    <InlineInput
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        setHighlightIndex(-1);
      }}
      onKeyDown={handleInputKeyDown}
      placeholder="Type to search..."
      data-testid="add-tag-input"
    />
    {(filteredSuggestions.length > 0 || showCreateOption) && (
      <Dropdown role="listbox" data-testid="tag-suggestions">
        {filteredSuggestions.map((tag, i) => (
          <DropdownItem
            key={tag.id}
            role="option"
            $highlighted={i === highlightIndex}
            onMouseDown={(e) => {
              e.preventDefault();
              addTag(tag.name, false);
            }}
          >
            {tag.name}
          </DropdownItem>
        ))}
        {showCreateOption && (
          <DropdownItem
            role="option"
            $highlighted={highlightIndex === filteredSuggestions.length}
            onMouseDown={(e) => {
              e.preventDefault();
              addTag(normalizedInput, true);
            }}
          >
            Create "<CreateLabel>{normalizedInput}</CreateLabel>"
          </DropdownItem>
        )}
      </Dropdown>
    )}
  </InputWrapper>
) : (
  <AddButton
    onClick={() => setShowInput(true)}
    data-testid="add-tag-button"
  >
    <PlusIcon /> Add tag
  </AddButton>
)}
```

**Verify:** Build compiles, dev server renders the component.

**Commit:**
```bash
git add frontend/src/components/TagEditor.tsx
git commit -m "feat: add tag input with autocomplete and Create option to TagEditor"
```

---

### Task 3: Integrate TagEditor into MediaPage

**Files:**
- Modify: `frontend/src/pages/MediaPage.tsx`

Replace the `TagInput` usage with `TagEditor`.

**Changes:**

1. In the import, replace `TagInput` with `TagEditor`:

```tsx
import {
  Button,
  Media,
  MediaOverlay,
  TagEditor,   // was TagInput
  AlertDialogRoot,
  // ... rest unchanged
} from '../components';
```

2. In the JSX, replace the `TagPanel` contents:

```tsx
<TagPanel data-testid="tag-list">
  <TagEditor
    tags={media.tags}
    onSave={(tags) => tagMutation.mutate(tags)}
  />
</TagPanel>
```

**Verify:** Start the dev server. Navigate to a media detail page. Confirm:
- Tags display as chips with X buttons
- Clicking X adds strikethrough, clicking the struck chip restores it
- "+ Add tag" opens inline input with autocomplete
- "Create X" item appears for new tags
- Save/Cancel appear when dirty
- Save calls the API, Cancel reverts

**Commit:**
```bash
git add frontend/src/pages/MediaPage.tsx
git commit -m "feat: integrate TagEditor into MediaPage replacing TagInput"
```

---

### Task 4: Update MediaPage POM with high-level tag editing methods

**Files:**
- Modify: `frontend/e2e/pom/MediaPage.ts`

Update the POM to work with the new TagEditor. Replace the old tag-related locators and add high-level methods.

**New POM code:**

Replace the tag-related locators and add methods:

```ts
// Replace existing tag locators:
readonly tagList: Locator;
readonly tagChips: Locator;
readonly removedTagChips: Locator;
readonly addTagButton: Locator;
readonly addTagInput: Locator;
readonly saveTagsButton: Locator;
readonly cancelTagsButton: Locator;

// In constructor, replace old tag lines:
this.tagList = page.getByTestId('tag-editor');
this.tagChips = this.tagList.getByTestId('tag-chip');
this.removedTagChips = this.tagList.getByTestId('removed-tag-chip');
this.addTagButton = this.tagList.getByTestId('add-tag-button');
this.addTagInput = this.tagList.getByTestId('add-tag-input');
this.saveTagsButton = this.tagList.getByTestId('save-tags');
this.cancelTagsButton = this.tagList.getByTestId('cancel-tags');
// Remove: this.tagInput = ...

// Add high-level methods:
async addTag(name: string) {
  await this.addTagButton.click();
  await this.addTagInput.fill(name);
  await this.addTagInput.press('Enter');
  await this.addTagInput.press('Escape');
}

async removeTag(name: string) {
  await this.tagChips.filter({ hasText: name }).getByRole('button').click();
}

async saveTags() {
  await this.saveTagsButton.click();
}

async cancelTagEdit() {
  await this.cancelTagsButton.click();
}

async editTags({ add, remove }: { add?: string[]; remove?: string[] }) {
  if (remove) {
    for (const tag of remove) {
      await this.removeTag(tag);
    }
  }
  if (add) {
    await this.addTagButton.click();
    for (const tag of add) {
      await this.addTagInput.fill(tag);
      await this.addTagInput.press('Enter');
    }
    await this.addTagInput.press('Escape');
  }
  await this.saveTags();
}
```

Note: remove the old `tagInput` field declaration and its constructor assignment entirely.

**Commit:**
```bash
git add frontend/e2e/pom/MediaPage.ts
git commit -m "feat: update MediaPage POM with high-level tag editing methods"
```

---

### Task 5: Update e2e tag tests for the new TagEditor flow

**Files:**
- Modify: `frontend/e2e/tests/tags.test.ts`

Update the tests to use the new POM methods instead of direct input manipulation.

**Changes to existing tests:**

1. **"upload with tags shows them on detail page"** — Update locator expectation. The `tagList` testid changed from `tag-list` to `tag-editor` (already handled by POM), but `tagChips` still uses `tag-chip` testid so the test should still work. Keep as-is, just verify it passes.

2. **"edit tags on detail page"** — Rewrite to use `editTags`:

```ts
e2eTest('edit tags on detail page', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg', {
    name: 'Edit Tags',
    tags: ['original'],
  });
  await page.waitForURL(/\/media\//);

  await mediaPage.editTags({ remove: ['original'], add: ['updated', 'new-tag'] });

  await expect(mediaPage.tagChips).toHaveCount(2);
  await expect(mediaPage.tagChips.nth(0)).toContainText('new-tag');
  await expect(mediaPage.tagChips.nth(1)).toContainText('updated');
});
```

3. **"upload without tags shows no tag list"** — Update to check for the add tag button:

```ts
e2eTest('upload without tags shows no tag list', async ({
  page,
  uploadPage,
  mediaPage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg', { name: 'No Tags' });
  await page.waitForURL(/\/media\//);

  await expect(mediaPage.tagChips).toHaveCount(0);
  await expect(mediaPage.addTagButton).toBeVisible();
});
```

**Run tests:**
```bash
cd frontend && pnpm test:e2e -- --grep "tagging"
```

**Commit:**
```bash
git add frontend/e2e/tests/tags.test.ts
git commit -m "test: update tag e2e tests for new TagEditor flow"
```

---

### Task 6: Update the data-testid on TagPanel in MediaPage

**Files:**
- Modify: `frontend/src/pages/MediaPage.tsx`

The `TagPanel` currently has `data-testid="tag-list"` but the `TagEditor` component itself has `data-testid="tag-editor"`. The POM now uses `tag-editor` as the root locator. Remove the redundant `data-testid` from `TagPanel` since the `TagEditor` provides its own.

**Change:**
```tsx
// From:
<TagPanel data-testid="tag-list">
// To:
<TagPanel>
```

**Commit:**
```bash
git add frontend/src/pages/MediaPage.tsx
git commit -m "refactor: remove redundant tag-list testid from TagPanel"
```

---

### Task 7: Run all e2e tests and fix any regressions

**Run:**
```bash
cd frontend && pnpm test:e2e
```

Fix any failing tests. Common issues to watch for:
- Tag filtering tests on browse page should be unaffected (they use `TagInput` via the filter bar)
- Media overlay tests should be unaffected
- Media actions tests should be unaffected

**Commit** any fixes.

---

### Task 8: Final cleanup and verify

**Verify:**
1. All e2e tests pass
2. No unused imports in modified files
3. TypeScript compiles without errors: `cd frontend && pnpm exec tsc --noEmit`
4. The `TagInput` component is still used by:
   - `HomePage.tsx` (filter bar)
   - `UploadPage.tsx` (upload form)

   Confirm these still work correctly.

**Commit** any cleanup.
