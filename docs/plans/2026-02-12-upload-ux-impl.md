# Upload UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file preview, drag-and-drop, and clipboard paste support to the upload flow, with global drop/paste on all non-upload pages navigating to upload with the file prefilled.

**Architecture:** A `DropZone` component handles file selection (click, drag, paste) and preview on the upload page. A `useGlobalFileDrop` hook in the `Layout` component handles drag/paste on all other pages, navigating to `/upload` with the file in React Router state. The upload page reads `location.state.file` on mount to prefill from global drop/paste.

**Tech Stack:** React, styled-components, React Router (navigate state), Playwright (e2e tests)

---

### Task 1: DropZone Component

**Files:**
- Create: `frontend/src/components/DropZone.tsx`
- Modify: `frontend/src/components/index.ts`

**Context:** This is the core file selection + preview component. It replaces the bare `<input type="file">` on the upload page. The component manages its own object URL for preview and cleans it up on unmount or file change. It uses a hidden file input triggered by clicking the container.

Reference existing styled-components patterns in the codebase: use theme tokens from `frontend/src/styles/theme.ts` (colors: `bg`, `surface`, `border`, `text`, `textSecondary`, `primary`; spacing: `xs`-`xl`; borderRadius: `sm`/`md`/`lg`; fontSize: `sm`/`md`). Follow the transient prop pattern (`$propName`) used elsewhere (e.g., `TagEditor.tsx`).

**Step 1: Create DropZone component**

Create `frontend/src/components/DropZone.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { UploadIcon } from '@radix-ui/react-icons';
import styled, { css } from 'styled-components';

interface DropZoneProps {
  value: File | null;
  onChange: (file: File) => void;
  accept: string[];
}

const Container = styled.div<{ $dragOver: boolean; $hasFile: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 2px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  overflow: hidden;

  ${({ $dragOver, theme }) =>
    $dragOver &&
    css`
      border-color: ${theme.colors.primary};
      background: ${theme.colors.primary}15;
    `}

  ${({ $hasFile }) =>
    $hasFile &&
    css`
      border-style: solid;
      min-height: 0;
    `}

  &:hover {
    border-color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xl};

  svg {
    width: 32px;
    height: 32px;
  }
`;

const PlaceholderText = styled.span`
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const PreviewImage = styled.img`
  display: block;
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
`;

const PreviewVideo = styled.video`
  display: block;
  max-width: 100%;
  max-height: 400px;
`;

const ChangeOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: ${({ theme }) => theme.fontSize.md};
  opacity: 0;
  transition: opacity 0.15s;

  ${Container}:hover & {
    opacity: 1;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

function isAcceptedType(file: File, accept: string[]): boolean {
  return accept.some((type) => file.type === type);
}

function isVideoType(file: File): boolean {
  return file.type.startsWith('video/');
}

export function DropZone({ value, onChange, accept }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage object URL lifecycle
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function handleFile(file: File) {
    if (isAcceptedType(file, accept)) {
      onChange(file);
    }
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const file = e.clipboardData.files[0];
    if (file) handleFile(file);
  }

  return (
    <Container
      $dragOver={dragOver}
      $hasFile={!!value}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      data-testid="drop-zone"
    >
      <HiddenInput
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        onChange={handleInputChange}
      />
      {value && previewUrl ? (
        <>
          {isVideoType(value) ? (
            <PreviewVideo
              src={previewUrl}
              controls
              onClick={(e) => e.stopPropagation()}
              data-testid="upload-preview-video"
            />
          ) : (
            <PreviewImage
              src={previewUrl}
              alt="Preview"
              data-testid="upload-preview-image"
            />
          )}
          <ChangeOverlay>Click or drop to change</ChangeOverlay>
        </>
      ) : (
        <Placeholder>
          <UploadIcon />
          <PlaceholderText>
            Drop file here, paste, or click to browse
          </PlaceholderText>
        </Placeholder>
      )}
    </Container>
  );
}
```

**Step 2: Export from index**

Add to `frontend/src/components/index.ts`:

```ts
export { DropZone } from './DropZone';
```

Add it after the existing `Button` export (near the top, alphabetically).

**Step 3: Verify it compiles**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/DropZone.tsx frontend/src/components/index.ts
git commit -m "feat: add DropZone component with preview, drag-drop, and paste"
```

---

### Task 2: Upload Page Integration

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

**Context:** Replace the bare file `<Input>` with the new `DropZone` component. Read `location.state?.file` on mount to support the global drop/paste → navigate flow (Task 3). The form submission logic stays unchanged — `file` is already a `File` object.

The current UploadPage has:
- `ACCEPTED_TYPES` as a comma-separated string: `'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime'`
- `[file, setFile] = useState<File | null>(null)`
- A `<Field>` with `<Label htmlFor="file">File</Label>` and `<Input type="file" ...>`

**Step 1: Integrate DropZone into UploadPage**

Modify `frontend/src/pages/UploadPage.tsx`:

1. Add `useLocation` to the react-router-dom import:
```ts
import { useLocation, useNavigate } from 'react-router-dom';
```

2. Change the `ACCEPTED_TYPES` constant from a comma-separated string to an array (DropZone expects `string[]`):
```ts
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];
```

3. Add `DropZone` to the component imports:
```ts
import { Button, DropZone, Label, TagInput } from '../components';
```
(Remove `Input` from this import — it's no longer used. Keep `Label` and `TagInput`.)

4. Inside the component, add location and prefill logic:
```ts
const location = useLocation();
const [file, setFile] = useState<File | null>(() => {
  const stateFile = (location.state as { file?: File } | null)?.file;
  return stateFile instanceof File ? stateFile : null;
});
```

5. Replace the File `<Field>` block (the one with `<Label htmlFor="file">File</Label>` and the `<Input type="file" ...>`) with:
```tsx
<Field>
  <Label>File</Label>
  <DropZone value={file} onChange={setFile} accept={ACCEPTED_TYPES} />
</Field>
```

6. Add a new `Input` import for the name field — actually, looking at the current code again, the name field also uses `Input`. So keep `Input` in the import but now it's only used for the name field. Actually wait — looking at the code, name uses `Input` component too. Let me re-check:
   - File field: `<Input type="file" ...>` → replaced with DropZone
   - Name field: `<Input id="name" placeholder="Give it a name" ...>` → stays as Input

   So **keep `Input`** in the import, just remove the file input usage.

Corrected import:
```ts
import { Button, DropZone, Input, Label, TagInput } from '../components';
```

**Step 2: Verify it compiles**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: replace file input with DropZone on upload page"
```

---

### Task 3: useGlobalFileDrop Hook + Layout Integration

**Files:**
- Create: `frontend/src/hooks/useGlobalFileDrop.ts`
- Modify: `frontend/src/components/Layout.tsx`

**Context:** This hook provides drag-and-drop and paste handling on all pages except `/upload`. When a file is dropped or pasted, it navigates to `/upload` with the file in router state. The Layout component already wraps all protected routes via `<Outlet />`, so it's the right place to use this hook and render the drag overlay.

The `dragleave` counter pattern is important: `dragenter` fires on every child element, so a simple boolean flickers. Instead, increment a counter on `dragenter` and decrement on `dragleave` — the overlay shows when counter > 0 and hides when it reaches 0.

The paste listener should skip activation when the user is typing in an input, textarea, or contenteditable element.

**Step 1: Create the hook**

Create `frontend/src/hooks/useGlobalFileDrop.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function isAcceptedType(file: File, accept: string[]): boolean {
  return accept.some((type) => file.type === type);
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return el.type !== 'file';
  if (el instanceof HTMLTextAreaElement) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useGlobalFileDrop(acceptedTypes: string[]) {
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const counterRef = useRef(0);

  const isUploadPage = location.pathname === '/upload';

  const handleFile = useCallback(
    (file: File) => {
      if (isAcceptedType(file, acceptedTypes)) {
        navigate('/upload', { state: { file } });
      }
    },
    [acceptedTypes, navigate],
  );

  useEffect(() => {
    if (isUploadPage) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      // Only show overlay if dragging files (not text, etc.)
      if (e.dataTransfer?.types.includes('Files')) {
        counterRef.current++;
        setIsDragging(true);
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      counterRef.current--;
      if (counterRef.current <= 0) {
        counterRef.current = 0;
        setIsDragging(false);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      counterRef.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) handleFile(file);
    }

    function handlePaste(e: ClipboardEvent) {
      if (isTextInput(document.activeElement)) return;
      const file = e.clipboardData?.files[0];
      if (file && isAcceptedType(file, acceptedTypes)) {
        e.preventDefault();
        handleFile(file);
      }
    }

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('paste', handlePaste);
      counterRef.current = 0;
    };
  }, [isUploadPage, handleFile, acceptedTypes]);

  return { isDragging };
}
```

**Step 2: Add drag overlay to Layout**

Modify `frontend/src/components/Layout.tsx`:

1. Add imports:
```ts
import { useGlobalFileDrop } from '../hooks/useGlobalFileDrop';
```

2. Add styled component for the overlay (add after existing styled components, before the `Layout` function):
```ts
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const DragOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: none;
`;

const DragOverlayText = styled.p`
  font-size: ${({ theme }) => theme.fontSize.xl};
  color: white;
  background: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.xl};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
`;
```

3. Inside the `Layout` function, add the hook call and render the overlay:
```tsx
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDragging } = useGlobalFileDrop(ACCEPTED_TYPES);

  return (
    <>
      <Nav>
        {/* ... existing nav content unchanged ... */}
      </Nav>
      <Outlet />
      {isDragging && (
        <DragOverlay data-testid="drag-overlay">
          <DragOverlayText>Drop to upload</DragOverlayText>
        </DragOverlay>
      )}
    </>
  );
}
```

**Step 3: Verify it compiles**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/hooks/useGlobalFileDrop.ts frontend/src/components/Layout.tsx
git commit -m "feat: add global drag-drop and paste-to-upload with overlay"
```

---

### Task 4: E2E Tests — Upload Preview

**Files:**
- Modify: `frontend/e2e/pom/UploadPage.ts`
- Modify: `frontend/e2e/tests/upload.test.ts`

**Context:** The existing `UploadPage` POM has a `fileInput` locator that targets `input[type="file"]`. This still works because DropZone renders a hidden `<input type="file">`. The `upload()` method calls `fileInput.setInputFiles()` which bypasses the click-to-open flow and sets the file directly — all existing tests continue to pass.

Add `previewImage` and `previewVideo` locators via the `data-testid` attributes set in DropZone. Add new tests to verify previews appear after file selection.

**Step 1: Add preview locators to UploadPage POM**

Modify `frontend/e2e/pom/UploadPage.ts` — add these fields and constructor assignments:

After the existing `errorText` field declaration, add:
```ts
readonly dropZone: Locator;
readonly previewImage: Locator;
readonly previewVideo: Locator;
```

In the constructor, after `this.errorText = ...`, add:
```ts
this.dropZone = page.getByTestId('drop-zone');
this.previewImage = page.getByTestId('upload-preview-image');
this.previewVideo = page.getByTestId('upload-preview-video');
```

**Step 2: Add preview tests**

Add to `frontend/e2e/tests/upload.test.ts` after the existing tests (before the closing — at the end of the file):

```ts
e2eTest('shows image preview after selecting file', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  await expect(uploadPage.previewImage).toBeVisible();
});

e2eTest('shows video preview after selecting file', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'kitten_horn.mp4'),
  );

  await expect(uploadPage.previewVideo).toBeVisible();
});
```

For these tests, `upload.test.ts` needs the `path` import and `TEST_DATA_DIR` constant. Add at the top of the file after the fixtures import:

```ts
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');
```

**Step 3: Run e2e tests**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm test:e2e --grep "preview|upload"`
Expected: All preview tests and existing upload tests pass.

**Step 4: Commit**

```bash
git add frontend/e2e/pom/UploadPage.ts frontend/e2e/tests/upload.test.ts
git commit -m "test: add e2e tests for upload file preview"
```

---

### Task 5: E2E Tests — Global Drop and Paste

**Files:**
- Create: `frontend/e2e/tests/drop-upload.test.ts`

**Context:** Test the global drag-drop and paste behavior from the browse page. Playwright supports file drag-and-drop via `page.dispatchEvent` or the `page.locator().setInputFiles()` approach. For drag-and-drop, we use Playwright's `DataTransfer` simulation. For paste, we use `page.evaluate` to dispatch a `ClipboardEvent` with a file.

Note: Playwright's file drag-and-drop can be done via the `page.dispatchEvent` approach: create a DataTransfer in the browser context, add a file, and dispatch `drop` on the document. See the Playwright docs for file-based event simulation.

Actually, Playwright has a simpler approach: since the global drop handler navigates to `/upload` with state, and the upload page reads `location.state.file`, we can test both halves:
1. The overlay appears on dragenter (via dispatching dragenter with `dataTransfer.types` including 'Files')
2. After drop, we're on `/upload` (testing the navigation)

For the paste test, since we can't easily construct a File in `clipboardData` via Playwright's keyboard API, we can use `page.evaluate` to dispatch a custom paste event.

**Step 1: Create drop-upload test file**

Create `frontend/e2e/tests/drop-upload.test.ts`:

```ts
import path from 'node:path';
import { e2eTest, expect } from '../fixtures.ts';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

e2eTest.describe('drag-drop and paste upload', () => {
  e2eTest.beforeEach(async ({ page, registerPage }) => {
    await registerPage.register('dropper', 'password123');
    await page.waitForURL('/');
  });

  e2eTest('shows drag overlay when dragging file over browse page', async ({ page, browsePage }) => {
    await browsePage.goto();

    // Simulate dragenter with Files type
    await page.evaluate(() => {
      const event = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer: new DataTransfer(),
      });
      // DataTransfer items indicate files are being dragged
      event.dataTransfer!.items.add(new File([''], 'test.jpg', { type: 'image/jpeg' }));
      document.dispatchEvent(event);
    });

    await expect(page.getByTestId('drag-overlay')).toBeVisible();
  });

  e2eTest('dropping file on browse page navigates to upload with preview', async ({ page, browsePage, uploadPage }) => {
    await browsePage.goto();

    const filePath = path.join(TEST_DATA_DIR, 'sokerivarasto.jpg');

    // Use Playwright's built-in file drop support
    await page.locator('body').dispatchEvent('drop', {}, {});

    // Alternative: use evaluate to simulate the full drop flow
    const fileBuffer = await (await import('fs/promises')).readFile(filePath);
    await page.evaluate(async (data) => {
      const arr = new Uint8Array(data);
      const file = new File([arr], 'sokerivarasto.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const event = new DragEvent('drop', {
        bubbles: true,
        dataTransfer: dt,
      });
      document.dispatchEvent(event);
    }, Array.from(fileBuffer));

    await expect(page).toHaveURL('/upload');
    await expect(uploadPage.previewImage).toBeVisible();
  });

  e2eTest('pasting file on browse page navigates to upload with preview', async ({ page, browsePage, uploadPage }) => {
    await browsePage.goto();

    const filePath = path.join(TEST_DATA_DIR, 'sokerivarasto.jpg');
    const fileBuffer = await (await import('fs/promises')).readFile(filePath);

    await page.evaluate(async (data) => {
      const arr = new Uint8Array(data);
      const file = new File([arr], 'sokerivarasto.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        clipboardData: dt,
      });
      document.dispatchEvent(event);
    }, Array.from(fileBuffer));

    await expect(page).toHaveURL('/upload');
    await expect(uploadPage.previewImage).toBeVisible();
  });
});
```

**Important note for the implementer:** The `ClipboardEvent` constructor's `clipboardData` option may not work in all browsers — it's a read-only property in some implementations. If the paste test doesn't work with this approach, an alternative is to use `Object.defineProperty` to set clipboardData on the event, or to test paste only on the upload page's DropZone (which uses React's `onPaste` and is easier to trigger). The drag overlay test and the drop-to-navigate test are the most important ones.

Adjust the test approach based on what actually works in Playwright's Chromium. The implementer should run the tests and iterate.

**Step 2: Run e2e tests**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm test:e2e --grep "drag-drop"`
Expected: Tests pass (or iterate on the event simulation approach if needed).

**Step 3: Commit**

```bash
git add frontend/e2e/tests/drop-upload.test.ts
git commit -m "test: add e2e tests for global drag-drop and paste upload"
```

---

### Task 6: Run All Tests + Lint + Final Cleanup

**Files:**
- Potentially any file touched in Tasks 1-5

**Context:** Run the full test suite and lints to ensure nothing is broken. Fix any issues.

**Step 1: Run TypeScript check**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm exec tsc --noEmit`
Expected: No errors

**Step 2: Run lints**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm lint`
Expected: No errors (fix any lint issues — common ones: unused imports, `react-hooks/exhaustive-deps`)

**Step 3: Run full e2e test suite**

Run: `cd /home/paavohtl/koodia/meemi_kansio/frontend && pnpm test:e2e`
Expected: All tests pass (currently 38 existing + new preview/drop tests)

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address lint and test issues from upload UX changes"
```

(Only if there were fixes needed. Skip if everything passed clean.)
