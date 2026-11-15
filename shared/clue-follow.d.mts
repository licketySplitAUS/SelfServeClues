export type ClueFollowAnchor = { word: string; field: HTMLInputElement; focused: Element | null; selected: Element | null };
export function captureClueFollow(doc: Document, word: string, found?: string[]): ClueFollowAnchor | null;
export function centreNextClue(doc: Document, anchor: ClueFollowAnchor | null, found: Set<string>): HTMLElement | null;
