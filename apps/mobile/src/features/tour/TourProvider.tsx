import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { View } from 'react-native';

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourRegistry {
  register: (key: string, node: View | null) => void;
  measure: (key: string) => Promise<TargetRect | null>;
  has: (key: string) => boolean;
}

const TourRegistryContext = createContext<TourRegistry | null>(null);

/**
 * Registry of the elements the tour can point at.
 *
 * A coach mark is only useful if it highlights the real control, at the real
 * position, on the real screen – which means the tour has to be able to
 * measure a component it does not own. Each highlightable element registers
 * itself under a key; the tour asks for the key's rectangle when it needs it.
 *
 * Keeping this separate from the tour UI means a screen never imports the
 * tour: it only says "this view is called `bell`".
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const nodes = useRef(new Map<string, View>());

  const register = useCallback((key: string, node: View | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  const measure = useCallback(
    (key: string) =>
      new Promise<TargetRect | null>((resolve) => {
        const node = nodes.current.get(key);
        if (!node) {
          resolve(null);
          return;
        }
        // measureInWindow gives screen coordinates, which is what the overlay
        // needs – it sits above everything, outside any scroll container.
        node.measureInWindow((x, y, width, height) => {
          if (width === 0 && height === 0) resolve(null);
          else resolve({ x, y, width, height });
        });
      }),
    [],
  );

  const has = useCallback((key: string) => nodes.current.has(key), []);

  const value = useMemo<TourRegistry>(() => ({ register, measure, has }), [register, measure, has]);

  return <TourRegistryContext.Provider value={value}>{children}</TourRegistryContext.Provider>;
}

export function useTourRegistry(): TourRegistry | null {
  return useContext(TourRegistryContext);
}

/**
 * Marks a view as a tour anchor.
 *
 * ```tsx
 * const target = useTourTarget('bell');
 * <View ref={target.ref} collapsable={false}>…</View>
 * ```
 *
 * `collapsable={false}` matters: without it Android may flatten the view out
 * of the hierarchy and there is nothing left to measure.
 */
export function useTourTarget(key: string): { ref: (node: View | null) => void } {
  const registry = useTourRegistry();

  const ref = useCallback(
    (node: View | null) => {
      registry?.register(key, node);
    },
    [key, registry],
  );

  return { ref };
}
