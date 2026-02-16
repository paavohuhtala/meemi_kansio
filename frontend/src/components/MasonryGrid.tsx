import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface MasonryGridOwnProps<T> {
  items: T[];
  getItemHeight: (item: T, columnWidth: number) => number;
  getItemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  gap?: number;
  minColumnWidth?: number;
}

type MasonryGridProps<T> = MasonryGridOwnProps<T> &
  Omit<ComponentPropsWithoutRef<'div'>, keyof MasonryGridOwnProps<T>>;

interface ItemPosition {
  x: number;
  y: number;
  width: number;
}

export function MasonryGrid<T>({
  items,
  getItemHeight,
  getItemKey,
  renderItem,
  gap = 16,
  minColumnWidth = 300,
  ...rest
}: MasonryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { positions, containerHeight } = useMemo(() => {
    if (containerWidth === 0 || items.length === 0) {
      return { positions: new Map<string, ItemPosition>(), containerHeight: 0 };
    }

    const columnCount = Math.max(1, Math.floor(containerWidth / minColumnWidth));
    const columnWidth =
      (containerWidth - (columnCount - 1) * gap) / columnCount;
    const colHeights = new Array<number>(columnCount).fill(0);
    const pos = new Map<string, ItemPosition>();

    for (const item of items) {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = col * (columnWidth + gap);
      const y = colHeights[col];

      pos.set(getItemKey(item), { x, y, width: columnWidth });
      colHeights[col] += getItemHeight(item, columnWidth) + gap;
    }

    const height = Math.max(...colHeights) - gap;
    return { positions: pos, containerHeight: Math.max(0, height) };
  }, [items, containerWidth, gap, minColumnWidth, getItemHeight, getItemKey]);

  const ready = containerWidth > 0;

  return (
    <div
      ref={containerRef}
      {...rest}
      style={{ position: 'relative', height: ready ? containerHeight : undefined }}
    >
      {items.map((item) => {
        const key = getItemKey(item);
        const pos = positions.get(key);

        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              transform: pos
                ? `translate3d(${pos.x}px, ${pos.y}px, 0)`
                : undefined,
              width: pos?.width,
              opacity: pos ? 1 : 0,
            }}
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}
