export const selection = { index: 0 };
export const names = ['LINKEDIN', 'X / TWITTER', 'MEDIUM'];
export const badges = ['IN', '𝕏', 'M'];
export const destinations = ['https://www.linkedin.com/', 'https://x.com/', 'https://medium.com/'];

const selectionListeners = new Set<(index: number) => void>();

export function setSocialSelection(index: number): number {
  const next = ((index % 3) + 3) % 3;
  selection.index = next;
  selectionListeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeSelection(listener: (index: number) => void): () => void {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}
