import type { CSSProperties, ImgHTMLAttributes } from 'react';
import type { MediaItem } from '../api/media';

interface MediaProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  item: Pick<MediaItem, 'file_url' | 'media_type' | 'name' | 'width' | 'height'>;
  alt?: string;
  controls?: boolean;
  preload?: string;
}

function isPixelArt(item: Pick<MediaItem, 'width' | 'height'>): boolean {
  return item.width != null && item.height != null && item.width <= 64 && item.height <= 64;
}

export function Media({ item, alt, controls, preload, style, ...rest }: MediaProps) {
  if (item.media_type === 'video') {
    return <video src={item.file_url} controls={controls} preload={preload} />;
  }

  const pixelated = isPixelArt(item);
  const imgStyle: CSSProperties | undefined = pixelated
    ? { ...style, imageRendering: 'pixelated' as const }
    : style;

  return (
    <img
      src={item.file_url}
      alt={alt ?? item.name ?? ''}
      style={imgStyle}
      {...rest}
    />
  );
}
