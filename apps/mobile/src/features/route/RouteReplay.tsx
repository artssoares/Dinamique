import { RouteReplayShared, type RouteReplayProps } from './RouteReplayShared';
import { RouteReplayTrace } from './RouteReplayTrace';

/**
 * The replay on the web — and the module TypeScript resolves everywhere.
 *
 * Metro prefers `RouteReplay.native.tsx` on a device; the compiler knows
 * nothing about platform extensions, so the bare file has to be a real module
 * it can typecheck. Making that file the web one is what keeps MapLibre out of
 * the web dependency graph structurally, rather than by a runtime `if` that a
 * bundler would still have to follow.
 */
export function RouteReplay(props: RouteReplayProps) {
  return (
    <RouteReplayShared
      {...props}
      attribution={null}
      renderTrack={(progress) => (
        <RouteReplayTrace
          points={props.points}
          progress={progress}
          height={props.height ?? 260}
        />
      )}
    />
  );
}

export type { RouteReplayProps };
