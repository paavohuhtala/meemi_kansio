# Media Copy & Download Overlay

## Overview

Add copy-to-clipboard and download actions to media items on the browse page and media detail page. Actions appear as icon buttons in the top-right corner on hover.

## Component: `MediaOverlay`

Shared component placed inside any media container. Renders icon buttons using `@radix-ui/react-icons`.

### Props

```ts
interface MediaOverlayProps {
  fileUrl: string;
  fileName: string;
  mediaType: 'image' | 'video' | 'gif';
}
```

### Buttons shown by media type

| Type  | Copy | Download |
|-------|------|----------|
| image | Yes  | Yes      |
| gif   | No   | Yes      |
| video | No   | Yes      |

Copy is only available for static images (JPEG, PNG, WebP). GIFs and videos show download only.

### Styling

- Positioned `absolute`, top-right corner of parent container
- `opacity: 0` by default, revealed by parent `:hover`
- 32px icon buttons with semi-transparent dark background, white icons
- Brighter background on button hover
- Row layout with small gap between buttons

## Copy-to-clipboard

Fetches the image as a blob, converts to PNG via canvas (Clipboard API only guarantees PNG support), then writes using `navigator.clipboard.write()`.

On success, the copy icon swaps to a checkmark for 1.5 seconds. On failure, the button silently reverts — no error modal.

## Download

Creates a temporary `<a>` element with the `download` attribute set to the file name. Same-origin files work without CORS issues.

## Integration

### Browse page (HomePage)

`<MediaOverlay>` added inside each `Card`. Uses the same hover reveal pattern as the existing `NameOverlay`. Click handlers call `e.stopPropagation()` and `e.preventDefault()` to prevent navigation to the detail page.

### Media detail page (MediaPage)

`<MediaOverlay>` added inside `MediaWrapper`. Same hover pattern.

## Files to change

| File | Change |
|---|---|
| `package.json` | Add `@radix-ui/react-icons` |
| `src/components/MediaOverlay.tsx` | New shared overlay component |
| `src/components/index.ts` | Export `MediaOverlay` |
| `src/pages/HomePage.tsx` | Add overlay inside each Card |
| `src/pages/MediaPage.tsx` | Add overlay inside MediaWrapper |
