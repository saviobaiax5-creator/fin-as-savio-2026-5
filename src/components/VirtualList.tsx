import React, { useMemo, useRef, useState } from 'react';

export interface WindowedRange {
  startIndex: number;
  endIndex: number;
  topPaddingPx: number;
  bottomPaddingPx: number;
  isVirtualized: boolean;
}

export function computeWindowedRange(params: {
  totalCount: number;
  scrollTop: number;
  viewportHeight: number;
  itemHeight: number;
  overscan?: number;
  threshold?: number;
}): WindowedRange {
  const {
    totalCount,
    scrollTop,
    viewportHeight,
    itemHeight,
    overscan = 8,
    threshold = 35,
  } = params;

  if (totalCount <= threshold) {
    return {
      startIndex: 0,
      endIndex: totalCount,
      topPaddingPx: 0,
      bottomPaddingPx: 0,
      isVirtualized: false,
    };
  }

  const safeViewport = Math.max(viewportHeight, itemHeight * 6);
  const startRaw = Math.floor(scrollTop / itemHeight) - overscan;
  const visibleCount = Math.ceil(safeViewport / itemHeight) + overscan * 2;
  const startIndex = Math.max(0, startRaw);
  const endIndex = Math.min(totalCount, startIndex + visibleCount);

  return {
    startIndex,
    endIndex,
    topPaddingPx: startIndex * itemHeight,
    bottomPaddingPx: Math.max(0, (totalCount - endIndex) * itemHeight),
    isVirtualized: true,
  };
}

interface VirtualCardListProps<T> {
  items: T[];
  itemHeight?: number;
  maxHeightClass?: string;
  threshold?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
}

export function VirtualCardList<T>({
  items,
  itemHeight = 112,
  maxHeightClass = 'max-h-[70dvh]',
  threshold = 35,
  renderItem,
  getKey,
  className = '',
}: VirtualCardListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const range = useMemo(
    () =>
      computeWindowedRange({
        totalCount: items.length,
        scrollTop,
        viewportHeight: containerRef.current?.clientHeight || 640,
        itemHeight,
        threshold,
      }),
    [items.length, scrollTop, itemHeight, threshold]
  );

  const visibleSlice = items.slice(range.startIndex, range.endIndex);

  if (!range.isVirtualized) {
    return (
      <div className={className}>
        {items.map((item, idx) => (
          <React.Fragment key={getKey(item, idx)}>{renderItem(item, idx)}</React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`${maxHeightClass} overflow-y-auto overscroll-contain ${className}`}
    >
      {range.topPaddingPx > 0 && <div style={{ height: range.topPaddingPx }} aria-hidden="true" />}
      {visibleSlice.map((item, idx) => (
        <React.Fragment key={getKey(item, range.startIndex + idx)}>
          {renderItem(item, range.startIndex + idx)}
        </React.Fragment>
      ))}
      {range.bottomPaddingPx > 0 && (
        <div style={{ height: range.bottomPaddingPx }} aria-hidden="true" />
      )}
    </div>
  );
}
