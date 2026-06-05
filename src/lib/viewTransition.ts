import { flushSync } from 'react-dom';

/** Whether shared-element View Transitions should be used right now. */
export function viewTransitionsAvailable(): boolean {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return typeof document.startViewTransition === 'function' && !reduced;
}

/**
 * Run a React state update inside a View Transition so the browser can morph
 * shared elements (those given a matching `view-transition-name`).
 *
 * `flushSync` forces React to apply the DOM change synchronously inside the
 * transition callback, which the API requires. `afterUpdate` runs immediately
 * after the new DOM is committed but before the browser snapshots the new
 * state — use it to clear transient `view-transition-name`s so the same name
 * never appears twice in a single state.
 *
 * Returns the transition's `finished` promise (or a resolved promise on the
 * fallback path) so callers can clean up afterwards.
 */
export function runViewTransition(update: () => void, afterUpdate?: () => void): Promise<void> {
  if (!viewTransitionsAvailable() || !document.startViewTransition) {
    update();
    afterUpdate?.();
    return Promise.resolve();
  }

  // Flag the transition so entrance animations (e.g. the flyout spring) can be
  // suppressed — otherwise the panel would be mid-slide when the browser
  // snapshots the "new" state, giving the shared element a wrong morph target.
  // The flag stays on while the panel is open (cleared by the panel's owner on
  // close) so the spring entrance doesn't replay once the morph finishes.
  document.documentElement.classList.add('vt-active');
  const transition = document.startViewTransition(() => {
    flushSync(update);
    afterUpdate?.();
  });
  return transition.finished;
}

/**
 * Run a page-navigation state update as a directional slide. The whole root
 * snapshot slides out one way while the incoming page slides in from the other,
 * giving phone swipe-navigation a native, app-like feel. Falls back to an
 * instant update when View Transitions aren't available or motion is reduced.
 */
export function runNavTransition(dir: 'next' | 'prev', update: () => void): Promise<void> {
  if (!viewTransitionsAvailable() || !document.startViewTransition) {
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  const cls = dir === 'next' ? 'vt-nav-next' : 'vt-nav-prev';
  root.classList.add(cls);
  const transition = document.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => root.classList.remove(cls));
  return transition.finished;
}
