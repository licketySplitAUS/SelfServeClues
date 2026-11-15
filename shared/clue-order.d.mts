export type ClueOrder = 'alphabetical' | 'grid';
export function readClueOrder(cookie: string): ClueOrder;
export function clueOrderCookie(order: ClueOrder, hostname: string, secure: boolean): string;
export function groupCluesByGrid<T extends { word: string }>(grid: string, clues: T[]): { index: number; row: number; column: number; letter: string; clues: T[] }[];
