import type { Snapshot } from '../src/history/types';
export function validSnapshot(value: unknown): value is Snapshot;
export function loadCluesSnapshot(options: { fetchImpl?: typeof fetch; storage?: Storage; generation?: string | null; allowFallback?: boolean; signal?: AbortSignal }): Promise<{ snapshot: Snapshot; notice: string }>;
