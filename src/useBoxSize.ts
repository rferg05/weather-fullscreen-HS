import { useEffect, useState, type RefObject } from 'react';

export type BoxSize = { w: number; h: number } | null;

/**
 * An element's own box, kept current through a ResizeObserver, for parts of
 * a view that lay out from a box the browser decided (a flex row's share of
 * the leftover height, a grid cell) rather than from the type. Null until
 * the first measurement.
 *
 * Only measure boxes whose size does not depend on what is drawn in them,
 * or the fit loop chases its own tail.
 */
export function useBoxSize(ref: RefObject<HTMLElement | null>): BoxSize {
  const [size, setSize] = useState<BoxSize>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
