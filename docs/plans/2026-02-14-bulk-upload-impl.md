# Bulk Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the upload page to support selecting and uploading multiple files concurrently, with a results grid showing per-file status.

**Architecture:** Evolve `DropZone` with a discriminated union props pattern (single vs multi mode). Evolve `UploadPage` to track `File[]` and manage concurrent uploads with per-file status. Update `useGlobalFileDrop` to forward all dropped files. No backend changes.

**Tech Stack:** React 19, TypeScript, styled-components, React Router, existing `uploadMedia()` API function.

---

### Task 1: DropZone Multi-File Support

**Files:**
- Modify: `frontend/src/components/DropZone.tsx`

**Step 1: Update props to discriminated union**

Replace the `DropZoneProps` interface (line 5-9) with:

```ts
interface DropZoneBaseProps {
  accept: string[];
}

interface DropZoneSingleProps extends DropZoneBaseProps {
  multiple?: false;
  value: File | null;
  onChange: (file: File) => void;
}

interface DropZoneMultiProps extends DropZoneBaseProps {
  multiple: true;
  value: File[];
  onChange: (files: File[]) => void;
}

type DropZoneProps = DropZoneSingleProps | DropZoneMultiProps;
```

**Step 2: Add styled components for file list display**

Add after `PlaceholderText` (line 58):

```tsx
const FileList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
  width: 100%;
`;

const FileCount = styled.span`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
`;

const FileNames = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
`;
```

**Step 3: Rewrite component to handle both modes**

Replace the component function (line 102 to end) with:

```tsx
function dedupeFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map((f) => `${f.name}:${f.size}`));
  const newFiles = incoming.filter((f) => !seen.has(`${f.name}:${f.size}`));
  return [...existing, ...newFiles];
}

export function DropZone(props: DropZoneProps) {
  const { accept } = props;
  const isMulti = props.multiple === true;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Single-file preview URL
  const singleFile = !isMulti ? props.value : null;
  const previewUrl = useMemo(() => {
    return singleFile ? URL.createObjectURL(singleFile) : null;
  }, [singleFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFiles(fileList: FileList) {
    const accepted = Array.from(fileList).filter((f) => isAcceptedType(f, accept));
    if (accepted.length === 0) return;

    if (isMulti) {
      props.onChange(dedupeFiles(props.value, accepted));
    } else {
      props.onChange(accepted[0]);
    }
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
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
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (e.clipboardData.files.length > 0) {
      handleFiles(e.clipboardData.files);
    }
  }

  const hasFiles = isMulti ? props.value.length > 0 : !!props.value;
  const multiFiles = isMulti ? props.value : [];

  return (
    <Container
      $dragOver={dragOver}
      $hasFile={hasFiles}
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
        multiple={isMulti}
      />
      {isMulti && multiFiles.length > 0 ? (
        <>
          <FileList>
            <FileCount>{multiFiles.length} {multiFiles.length === 1 ? 'file' : 'files'} selected</FileCount>
            <FileNames>
              {multiFiles.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`}>{f.name}</li>
              ))}
            </FileNames>
          </FileList>
          <ChangeOverlay>Drop to add more files</ChangeOverlay>
        </>
      ) : singleFile && previewUrl ? (
        <>
          {isVideoType(singleFile) ? (
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
            Drop files here, paste, or click to browse
          </PlaceholderText>
        </Placeholder>
      )}
    </Container>
  );
}
```

**Step 4: Verify the frontend compiles**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add frontend/src/components/DropZone.tsx
git commit -m "feat: add multi-file support to DropZone"
```

---

### Task 2: UploadPage Bulk Upload Logic

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

**Step 1: Rewrite UploadPage with bulk state management**

Replace the entire file with:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { uploadMedia, type MediaItem } from '../api/media';
import { Button, DropZone } from '../components';

const Container = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xxl};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const ResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const ResultCard = styled.div`
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  flex-direction: column;
`;

const ResultThumb = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
`;

const ResultInfo = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  overflow: hidden;
`;

const ResultName = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultStatus = styled.div<{ $error?: boolean }>`
  color: ${({ theme, $error }) => $error ? theme.colors.error : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const ResultLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  &:hover {
    opacity: 0.8;
  }
`;

const ProgressText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

function nameFromFile(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

type UploadStatus =
  | { status: 'pending' }
  | { status: 'uploading' }
  | { status: 'success'; media: MediaItem }
  | { status: 'error'; error: string };

interface BulkEntry {
  file: File;
  result: UploadStatus;
}

export function UploadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<File[]>(() => {
    const state = location.state as { files?: File[]; file?: File } | null;
    if (state?.files && Array.isArray(state.files)) {
      return state.files.filter((f) => f instanceof File);
    }
    if (state?.file instanceof File) return [state.file];
    return [];
  });

  const [entries, setEntries] = useState<BulkEntry[] | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  const isBulk = files.length > 1 || (entries !== null && entries.length > 1);
  const isUploading = entries?.some((e) => e.result.status === 'uploading') ?? false;
  const isDone = entries !== null && entries.every(
    (e) => e.result.status === 'success' || e.result.status === 'error',
  );
  const settledCount = entries?.filter(
    (e) => e.result.status === 'success' || e.result.status === 'error',
  ).length ?? 0;

  function uploadFile(file: File, updateEntry: (result: UploadStatus) => void) {
    updateEntry({ status: 'uploading' });
    uploadMedia(file, nameFromFile(file))
      .then((media) => updateEntry({ status: 'success', media }))
      .catch((err) => updateEntry({ status: 'error', error: err.message ?? 'Upload failed' }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    // Single file: use simple flow with auto-navigate
    if (files.length === 1) {
      setSingleError(null);
      const initial: BulkEntry[] = [{ file: files[0], result: { status: 'uploading' } }];
      setEntries(initial);
      uploadMedia(files[0], nameFromFile(files[0]))
        .then((media) => {
          queryClient.invalidateQueries({ queryKey: ['media-list'] });
          navigate(`/media/${media.id}`);
        })
        .catch((err) => {
          setSingleError(err.message ?? 'Upload failed');
          setEntries(null);
        });
      return;
    }

    // Bulk: fire all concurrently
    const initial: BulkEntry[] = files.map((file) => ({
      file,
      result: { status: 'pending' as const },
    }));
    setEntries(initial);

    initial.forEach((entry, index) => {
      uploadFile(entry.file, (result) => {
        setEntries((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[index] = { ...next[index], result };
          return next;
        });
        if (result.status === 'success') {
          queryClient.invalidateQueries({ queryKey: ['media-list'] });
        }
      });
    });
  }

  function handleRetry(index: number) {
    if (!entries) return;
    const entry = entries[index];
    uploadFile(entry.file, (result) => {
      setEntries((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[index] = { ...next[index], result };
        return next;
      });
      if (result.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['media-list'] });
      }
    });
  }

  function handleReset() {
    setFiles([]);
    setEntries(null);
    setSingleError(null);
  }

  // Phase 2/3: Show results grid (bulk only)
  if (entries && isBulk) {
    return (
      <Container>
        <Heading>Upload</Heading>
        {!isDone && (
          <ProgressText>Uploaded {settledCount} / {entries.length}</ProgressText>
        )}
        <ResultsGrid data-testid="results-grid">
          {entries.map((entry, i) => {
            const r = entry.result;
            if (r.status === 'success') {
              return (
                <ResultLink key={i} to={`/media/${r.media.id}`} data-testid="result-card">
                  <ResultCard>
                    {r.media.thumbnail_url ? (
                      <ResultThumb src={r.media.thumbnail_url} alt={entry.file.name} />
                    ) : null}
                    <ResultInfo>
                      <ResultName>{entry.file.name}</ResultName>
                    </ResultInfo>
                  </ResultCard>
                </ResultLink>
              );
            }
            return (
              <ResultCard key={i} data-testid="result-card">
                <ResultInfo>
                  <ResultName>{entry.file.name}</ResultName>
                  {r.status === 'error' ? (
                    <>
                      <ResultStatus $error>{r.error}</ResultStatus>
                      <Button
                        variant="ghost"
                        onClick={() => handleRetry(i)}
                        data-testid="retry-button"
                      >
                        Retry
                      </Button>
                    </>
                  ) : (
                    <ResultStatus>
                      {r.status === 'uploading' ? 'Uploading...' : 'Waiting...'}
                    </ResultStatus>
                  )}
                </ResultInfo>
              </ResultCard>
            );
          })}
        </ResultsGrid>
        {isDone && (
          <Actions>
            <Button onClick={handleReset} data-testid="upload-more">Upload more</Button>
          </Actions>
        )}
      </Container>
    );
  }

  // Phase 1: Selection
  return (
    <Container>
      <Heading>Upload</Heading>
      <Form onSubmit={handleSubmit}>
        <DropZone
          multiple
          value={files}
          onChange={setFiles}
          accept={ACCEPTED_TYPES}
        />
        {singleError && <ErrorText>{singleError}</ErrorText>}
        <Button
          type="submit"
          disabled={files.length === 0}
          loading={isUploading && !isBulk}
          data-testid="upload-submit"
        >
          {isUploading && !isBulk
            ? 'Uploading...'
            : files.length > 1
              ? `Upload ${files.length} files`
              : 'Upload'}
        </Button>
      </Form>
    </Container>
  );
}
```

**Step 2: Verify the frontend compiles**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/UploadPage.tsx
git commit -m "feat: add bulk upload support to UploadPage"
```

---

### Task 3: Global Drop Handler Multi-File Support

**Files:**
- Modify: `frontend/src/hooks/useGlobalFileDrop.ts`

**Step 1: Update to forward all dropped files**

Replace `handleFile` callback (lines 24-31) with:

```ts
const handleFiles = useCallback(
  (files: File[]) => {
    const accepted = files.filter((f) => isAcceptedType(f, acceptedTypes));
    if (accepted.length > 0) {
      navigate('/upload', { state: { files: accepted } });
    }
  },
  [acceptedTypes, navigate],
);
```

Update `handleDrop` (lines 57-63) to collect all files:

```ts
function handleDrop(e: DragEvent) {
  e.preventDefault();
  counterRef.current = 0;
  setIsDragging(false);
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFiles(Array.from(files));
  }
}
```

Update `handlePaste` (lines 65-72) — paste sends single file wrapped in array:

```ts
function handlePaste(e: ClipboardEvent) {
  if (isTextInput(document.activeElement)) return;
  const file = e.clipboardData?.files[0];
  if (file && isAcceptedType(file, acceptedTypes)) {
    e.preventDefault();
    handleFiles([file]);
  }
}
```

Update the dependency array at line 88: change `handleFile` to `handleFiles`.

**Step 2: Verify the frontend compiles**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add frontend/src/hooks/useGlobalFileDrop.ts
git commit -m "feat: forward all dropped files in global drop handler"
```

---

### Task 4: Update UploadPage POM for E2E Tests

**Files:**
- Modify: `frontend/e2e/pom/UploadPage.ts`

**Step 1: Add bulk-specific locators and methods**

Replace the entire file with:

```ts
import type { Page, Locator } from '@playwright/test';
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

export class UploadPage {
  private readonly page: Page;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly errorText: Locator;
  readonly dropZone: Locator;
  readonly previewImage: Locator;
  readonly previewVideo: Locator;
  readonly resultsGrid: Locator;
  readonly resultCards: Locator;
  readonly uploadMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByTestId('upload-submit');
    this.errorText = page.getByText(/unsupported|failed|error/i);
    this.dropZone = page.getByTestId('drop-zone');
    this.previewImage = page.getByTestId('upload-preview-image');
    this.previewVideo = page.getByTestId('upload-preview-video');
    this.resultsGrid = page.getByTestId('results-grid');
    this.resultCards = page.getByTestId('result-card');
    this.uploadMoreButton = page.getByTestId('upload-more');
  }

  async goto() {
    await this.page.goto('/upload');
  }

  async upload(fileName: string) {
    await this.goto();
    await this.fileInput.setInputFiles(path.join(TEST_DATA_DIR, fileName));
    await this.submitButton.click();
  }

  async selectFiles(fileNames: string[]) {
    await this.fileInput.setInputFiles(
      fileNames.map((f) => path.join(TEST_DATA_DIR, f)),
    );
  }

  resultCardLinks() {
    return this.resultsGrid.locator('a[href^="/media/"]');
  }

  retryButton(index: number) {
    return this.resultCards.nth(index).getByTestId('retry-button');
  }
}
```

**Step 2: Commit**

```bash
git add frontend/e2e/pom/UploadPage.ts
git commit -m "feat: add bulk upload locators to UploadPage POM"
```

---

### Task 5: Fix Existing Upload E2E Tests

The `submitButton` locator changed from `getByRole('button', { name: 'Upload' })` to `getByTestId('upload-submit')`. Existing tests that use `uploadPage.submitButton` will work via the POM, but tests that directly reference the button by role need updating.

**Files:**
- Modify: `frontend/e2e/tests/upload.test.ts`

**Step 1: Run existing tests to check for failures**

Run: `cd frontend && pnpm test:e2e -- --grep "upload"`
Expected: Check which tests pass/fail with the new POM and UploadPage changes.

**Step 2: Fix any broken selectors or assertions**

The existing tests use `uploadPage.upload()` and `uploadPage.submitButton` which go through the POM — these should still work since the POM was updated. If tests that click `submitButton` fail because the button text changed or `data-testid` was added, adjust accordingly.

Specifically: `uploadPage.submitButton` was `getByRole('button', { name: 'Upload', exact: true })` — now it's `getByTestId('upload-submit')`. The POM change handles this.

**Step 3: Run tests again to verify all pass**

Run: `cd frontend && pnpm test:e2e -- --grep "upload"`
Expected: All existing upload tests pass.

**Step 4: Commit if any fixes were needed**

```bash
git add frontend/e2e/tests/upload.test.ts
git commit -m "fix: update upload tests for new POM selectors"
```

---

### Task 6: E2E Tests — Bulk Upload Success

**Files:**
- Create: `frontend/e2e/tests/bulk-upload.test.ts`

**Step 1: Write the bulk upload success test**

```ts
import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('bulkuploader', 'password123');
  await page.waitForURL('/');
});

e2eTest('bulk upload shows results grid with clickable thumbnails', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png', 'questionable_ethics.gif']);

  await expect(uploadPage.submitButton).toHaveText('Upload 3 files');
  await uploadPage.submitButton.click();

  // Wait for all uploads to complete — results grid appears with 3 cards
  await expect(uploadPage.resultCardLinks()).toHaveCount(3);

  // Each card links to a media page
  const hrefs = await uploadPage.resultCardLinks().evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/media\//);
  }
});

e2eTest('clicking result thumbnail navigates to media page', async ({ uploadPage, page, mediaPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  await expect(uploadPage.resultCardLinks()).toHaveCount(2);

  await uploadPage.resultCardLinks().first().click();
  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
});
```

**Step 2: Run test to verify it passes**

Run: `cd frontend && pnpm test:e2e -- --grep "bulk upload"`
Expected: PASS.

**Step 3: Commit**

```bash
git add frontend/e2e/tests/bulk-upload.test.ts
git commit -m "test: add bulk upload success e2e tests"
```

---

### Task 7: E2E Tests — Partial Failure, Retry, and Reset

**Files:**
- Modify: `frontend/e2e/tests/bulk-upload.test.ts`

**Step 1: Add partial failure and retry tests**

Append to the test file:

```ts
e2eTest('shows error for failed upload with retry button', async ({ uploadPage, page }) => {
  // Fail the second upload request
  let requestCount = 0;
  await page.route('**/api/media/upload', (route) => {
    requestCount++;
    if (requestCount === 2) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    } else {
      route.continue();
    }
  });

  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  // Wait for both to settle
  await expect(uploadPage.resultCards).toHaveCount(2);
  // One succeeds (has a link), one fails (has retry button)
  await expect(uploadPage.resultCardLinks()).toHaveCount(1);
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

e2eTest('retry recovers failed upload', async ({ uploadPage, page }) => {
  let requestCount = 0;
  await page.route('**/api/media/upload', (route) => {
    requestCount++;
    if (requestCount === 2) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    } else {
      route.continue();
    }
  });

  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  // Wait for failure card
  await expect(page.getByTestId('retry-button')).toBeVisible();

  // Remove route intercept so retry succeeds
  await page.unroute('**/api/media/upload');

  await page.getByTestId('retry-button').click();

  // Both should now be successful
  await expect(uploadPage.resultCardLinks()).toHaveCount(2);
});

e2eTest('upload more resets to selection', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  await expect(uploadPage.resultCardLinks()).toHaveCount(2);
  await uploadPage.uploadMoreButton.click();

  // Back to selection: drop zone visible, no results grid
  await expect(uploadPage.dropZone).toBeVisible();
  await expect(uploadPage.resultsGrid).not.toBeVisible();
});
```

**Step 2: Run the tests**

Run: `cd frontend && pnpm test:e2e -- --grep "bulk"`
Expected: All pass.

**Step 3: Commit**

```bash
git add frontend/e2e/tests/bulk-upload.test.ts
git commit -m "test: add failure, retry, and reset e2e tests for bulk upload"
```

---

### Task 8: E2E Tests — Single File Redirect and Global Multi-Drop

**Files:**
- Modify: `frontend/e2e/tests/bulk-upload.test.ts`
- Modify: `frontend/e2e/tests/drop-upload.test.ts`

**Step 1: Add single-file redirect test to bulk-upload.test.ts**

Append:

```ts
e2eTest('single file upload still navigates to media page', async ({ uploadPage, page, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
});
```

**Step 2: Add global multi-drop test to drop-upload.test.ts**

Add a new test inside the existing describe block:

```ts
e2eTest(
  'dropping multiple files on browse page navigates to upload with all files',
  async ({ browsePage, uploadPage, page }) => {
    await browsePage.goto();
    await browsePage.emptyState.waitFor({ state: 'visible' });

    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const testDir = resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

    const jpg = await readFile(resolve(testDir, 'sokerivarasto.jpg'));
    const png = await readFile(resolve(testDir, 'markus.png'));

    await page.evaluate(([jpgData, pngData]) => {
      const file1 = new File([new Uint8Array(jpgData)], 'sokerivarasto.jpg', { type: 'image/jpeg' });
      const file2 = new File([new Uint8Array(pngData)], 'markus.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file1);
      dt.items.add(file2);
      document.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    }, [Array.from(jpg), Array.from(png)]);

    await expect(page).toHaveURL('/upload');
    await expect(page.getByText('2 files selected')).toBeVisible();
  },
);
```

**Step 3: Run all upload-related tests**

Run: `cd frontend && pnpm test:e2e -- --grep "upload|drop"`
Expected: All pass.

**Step 4: Commit**

```bash
git add frontend/e2e/tests/bulk-upload.test.ts frontend/e2e/tests/drop-upload.test.ts
git commit -m "test: add single-file redirect and global multi-drop e2e tests"
```
