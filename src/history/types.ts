export type Word = { word: string; score: number; startRow?: number; startCol?: number; length?: number; count?: number };
export type Validation = { status: string; checkedAt: string; message: string; rejected: string[]; excluded?: string[]; tested: number; official?: { total: number; lengths: Record<string, number>; starts: Record<string, number>; prefixes: Record<string, number> }; differences?: { total: number; lengths: Record<string, number>; starts: Record<string, number>; prefixes: Record<string, number> } };
export type Game = { puzzle: number; gameId: number; date: string; letters: string; totalWords: number; totalScore: number; words?: Word[]; solveMs?: number; dictionaryVersion?: string; validation?: Validation | null };
export type Stats = {
  gameCount: number; uniqueWords: number; averageWords: number; legacyAverageWords: number;
  largest: Game | null; smallest: Game | null; recent: Game[];
  frequent: Word[]; longest: Word[]; highest: Word[];
  commonLetters: { letter: string; count: number }[]; rareLetters: { letter: string; count: number }[];
  appearancesByLength: { length: number; count: number }[];
  dictionaryCoverage: { length: string; seen: number; searched: number }[];
  over12: { length: string; seen: number; searched: number }; dictionaryCount: number;
};
export type Snapshot = {
  generation?: string; schemaVersion: number; source: string; sourceVersion: string; updatedAt: string; status: string;
  schedulingEnabled?: boolean;
  startMinute?: number;
  current: Game & { words: Word[] }; history: Stats;
  today: { counts: Record<string, { count: number; score: number }>; prefixes: Record<string, { count: number; score: number }>; starts: Record<string, { count: number; score: number }> };
  monitor?: { lastCheck: string | null; message: string | null; candidate: Game | null };
  comparison?: { previousWords: number; previousScore: number; added: string[]; removed: string[] } | null;
  corrections?: Record<string, { action: string; reason: string; changedAt: string }>;
};
export type Audit = {
  sourceRows: Record<string, number>; duplicatePuzzles: unknown[]; mismatchedTotals: unknown[]; invalidGrids: unknown[];
  missingPuzzles: number[]; customGames: unknown[]; legacySummary: Stats; canonicalSummary: Stats;
};
