export type Word = { word: string; score: number; startRow?: number; startCol?: number; length?: number; count?: number };
export type Game = { puzzle: number; gameId: number; date: string; letters: string; totalWords: number; totalScore: number; words?: Word[]; solveMs?: number; dictionaryVersion?: string };
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
  schemaVersion: number; source: string; sourceVersion: string; updatedAt: string; status: string;
  schedulingEnabled?: boolean;
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
