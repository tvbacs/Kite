/**
 * Utility to run tasks when the UI / JS thread is idle.
 * Replaces the deprecated React Native InteractionManager.
 * Uses requestIdleCallback when supported, with a reliable setTimeout/requestAnimationFrame fallback.
 */

export const runWhenIdle = (callback: () => void, timeout = 500): any => {
  if (typeof (globalThis as any).requestIdleCallback === 'function') {
    return (globalThis as any).requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, 16);
};

export const cancelIdle = (handle: any): void => {
  if (typeof (globalThis as any).cancelIdleCallback === 'function') {
    (globalThis as any).cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
};
