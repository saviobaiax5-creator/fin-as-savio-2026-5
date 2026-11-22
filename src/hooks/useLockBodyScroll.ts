import { useEffect } from 'react';

let activeLockCount = 0;
let previousOverflow = '';

/**
 * Ref-counted body scroll lock for mobile bottom sheets and dialogs.
 * Prevents background page rubber-banding/scroll bleed on iOS & Android
 * while safely supporting stacked modals.
 */
export function useLockBodyScroll(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    if (activeLockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [locked]);
}
