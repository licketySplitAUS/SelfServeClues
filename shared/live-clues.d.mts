export function watchClueUpdates(options: { win: Window; doc: Document; currentGeneration: () => string | null; onChange: (generation: string | null) => Promise<void>; fetchImpl?: typeof fetch; now?: () => number; intervalMs?: number }): () => void;
export function reconcileFound(saved: unknown, words: string[]): string[];
