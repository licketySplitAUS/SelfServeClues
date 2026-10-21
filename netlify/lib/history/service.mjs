import { createHash, randomUUID } from 'node:crypto';
import { adjust, meta, snapshotFor, unseenFourLetterWords } from './stats.mjs';
import { parseGrid, sameGrid, solveGrid, validIdentity } from './solver.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
export function makeService({ repo, baseline, archivedGame, fetchImpl = fetch, clock = () => new Date(), validate = null }) {
  const activeDictionary = corrections => {
    const list = new Set(baseline.dictionary);
    for (const [word, entry] of Object.entries(corrections)) {
      if (entry.action === 'exclude') list.delete(word); else list.add(word);
    }
    return [...list].sort();
  };
  const initialState = () => ({ sourceVersion: baseline.sourceVersion, puzzles: {}, revisions: {}, corrections: {}, current: structuredClone(baseline.current) });
  async function stateFor(control) {
    const state = control?.stateKey ? await repo.read(control.stateKey) : initialState();
    if (state.sourceVersion !== baseline.sourceVersion) throw new Error('The imported baseline changed. Export the preview history and migrate it before publishing more updates.');
    return state;
  }
  async function current() {
    const { value } = await repo.control();
    const snapshot = value?.snapshotKey ? await repo.read(value.snapshotKey)
      : snapshotFor(baseline.aggregate, baseline.games, baseline.current, baseline.dictionary, {
        source: 'import', sourceVersion: baseline.sourceVersion, updatedAt: baseline.importedAt,
        status: 'Imported database snapshot.',
      });
    return { ...snapshot, monitor: { lastCheck: value?.lastCheck || null, message: value?.message || null, candidate: value?.candidate || null } };
  }
  async function aggregateFor(state) {
    const aggregate = structuredClone(baseline.aggregate);
    const replaced = new Set(Object.keys(state.puzzles).map(Number));
    const games = baseline.games.filter(item => !replaced.has(item.puzzle));
    for (const puzzle of Object.values(state.puzzles)) {
      const imported = await archivedGame(puzzle.puzzle);
      if (imported) adjust(aggregate, imported, -1);
      adjust(aggregate, puzzle); games.push(meta(puzzle));
    }
    return { aggregate, games };
  }
  async function unseenWords() {
    const { value } = await repo.control();
    const state = await stateFor(value);
    const { aggregate, games } = await aggregateFor(state);
    const dates = games.map(game => game.date).filter(Boolean).sort();
    return { ...unseenFourLetterWords(aggregate, activeDictionary(state.corrections)),
      firstDate: dates[0] || null, lastDate: dates.at(-1) || null,
      currentPuzzle: state.current.puzzle, updatedAt: state.current.solvedAt || baseline.importedAt,
      sourceVersion: baseline.sourceVersion };
  }
  async function check({ accept = false, manualGrid = null, correction = null, rebuild = false } = {}) {
    const saved = await repo.control(), control = saved.value || {};
    const now = clock().toISOString();
    const active = control.active || baseline.current;
    let grid;
    try {
      if (manualGrid) {
        grid = { puzzle: Number(manualGrid.puzzle), date: manualGrid.date, letters: String(manualGrid.letters || '').toUpperCase().replace(/\s/g, '') };
        if (!validIdentity(grid) || !manualGrid.reason?.trim()) throw new Error('A manual grid needs a valid puzzle, ISO date, 25 letters and a reason.');
      } else if (correction || rebuild) grid = { puzzle: active.puzzle, date: active.date, letters: active.letters };
      else {
        const response = await fetchImpl('https://www.playbabble.com/', {
          signal: AbortSignal.timeout(6500), headers: { 'user-agent': 'LicketysHistoryPreview/1.0 (+Netlify)' }, cache: 'no-store',
        });
        if (!response.ok) throw new Error(`PlayBabble returned ${response.status}.`);
        grid = parseGrid(await response.text());
      }
      if (grid.puzzle < active.puzzle || grid.date < active.date) throw new Error('PlayBabble supplied an older puzzle. Keeping the last published result.');
      if (grid.date > new Date(+clock() + 86400000).toISOString().slice(0, 10)) throw new Error('Puzzle date is implausibly far in the future.');
    } catch (error) {
      await repo.commit({ ...control, lastCheck: now, message: error.message }, saved.etag);
      return { outcome: 'waiting', message: error.message };
    }
    if (sameGrid(active, grid) && !correction && !rebuild && !manualGrid && (!validate || ['matched', 'corrected'].includes(control.validationStatus))) {
      await repo.commit({ ...control, candidate: null, lastCheck: now, message: 'Upstream still serves the published puzzle; no history was added.' }, saved.etag);
      return { outcome: 'unchanged', puzzle: active.puzzle };
    }
    // A new identity is observed twice in separate invocations. An authenticated
    // operator may accept the freshly fetched candidate immediately.
    if (!sameGrid(active, grid) && !accept && !manualGrid && !correction && !rebuild &&
        (!sameGrid(control.candidate, grid) || +clock() - Date.parse(control.candidate.observedAt) < 20000)) {
      const candidate = { ...grid, observedAt: now };
      await repo.commit({ ...control, candidate, lastCheck: now, message: 'New/changed grid detected; waiting for a second observation or admin approval.' }, saved.etag);
      return { outcome: 'candidate', candidate };
    }
    const state = await stateFor(control);
    if (correction) {
      const word = String(correction.word || '').trim().toLowerCase();
      if (!/^[a-z]{4,50}$/.test(word) || !['exclude', 'include', 'restore'].includes(correction.action) || !correction.reason?.trim()) throw new Error('A word correction needs a valid word, action and reason.');
      if (correction.action === 'restore') delete state.corrections[word];
      else state.corrections[word] = { action: correction.action, reason: correction.reason.trim().slice(0, 300), changedAt: now };
    }
    let dictionary = activeDictionary(state.corrections);
    const started = performance.now();
    let words = solveGrid(grid.letters, dictionary);
    const solveMs = Math.round(performance.now() - started);
    if (!words.length) throw new Error('The solver produced no words. No new result was published.');
    const prior = state.puzzles[grid.puzzle];
    const validation = validate ? await validate(grid, words, sameGrid(prior, grid) ? prior.validation : null) : null;
    for (const word of validation?.rejected || []) {
      if (!words.some(row => row.word === word)) throw new Error('Validation returned an unknown word.');
      state.corrections[word] = { action: 'exclude', reason: `PlayBabble explicitly rejected dictionary membership in puzzle #${grid.puzzle}.`, changedAt: now, source: 'babble-validation' };
    }
    if (validation?.rejected?.length) {
      dictionary = activeDictionary(state.corrections);
      words = solveGrid(grid.letters, dictionary);
    }
    if (validation) {
      validation.excluded = Object.entries(state.corrections).filter(([, entry]) => entry.source === 'babble-validation' && entry.reason.includes(`#${grid.puzzle}.`)).map(([word]) => word);
      if (validation.status === 'matched' && validation.excluded.length) validation.status = 'corrected';
    }
    const game = { ...grid, validation, gameId: grid.puzzle, totalWords: words.length, totalScore: words.reduce((n, word) => n + word.score, 0), words,
      dictionaryVersion: hash(dictionary), solvedAt: now, solveMs, reason: manualGrid?.reason?.trim().slice(0, 300) || correction?.reason?.trim().slice(0, 300) || (rebuild ? 'Admin re-solve' : 'Upstream observation') };
    const old = state.puzzles[grid.puzzle] || await archivedGame(grid.puzzle);
    state.puzzles[grid.puzzle] = game;
    // These are derived caches, never authoritative mutable counters in Blobs.
    // Regenerate from the fixed baseline plus immutable per-puzzle source data.
    const { aggregate, games } = await aggregateFor(state);
    const generation = `${now.replace(/[:.]/g, '-')}-${randomUUID()}`;
    const gameKey = `puzzles/${grid.puzzle}/${generation}`;
    state.revisions[grid.puzzle] = gameKey; state.current = game;
    const snapshot = snapshotFor(aggregate, games, game, dictionary, {
      source: 'preview', sourceVersion: baseline.sourceVersion, updatedAt: now, generation,
      status: 'Experimental result. The original clues page and shared data are unchanged.',
      correctionCount: Object.keys(state.corrections).length,
      corrections: state.corrections,
      comparison: old ? { previousWords: old.totalWords, previousScore: old.totalScore,
        added: words.filter(row => !old.words.some(prior => prior.word === row.word)).map(row => row.word),
        removed: old.words.filter(row => !words.some(next => next.word === row.word)).map(row => row.word) } : null,
    });
    const stateKey = `generations/${generation}/state`, snapshotKey = `generations/${generation}/snapshot`;
    await repo.write(gameKey, game); await repo.write(stateKey, state); await repo.write(snapshotKey, snapshot);
    const previous = control.snapshotKey ? { stateKey: control.stateKey, snapshotKey: control.snapshotKey, active: control.active, generation: control.generation } : null;
    await repo.commit({ stateKey, snapshotKey, active: grid, validationStatus: validation?.status || null, generation, previous, lastCheck: now, candidate: null, message: `Preview puzzle ${grid.puzzle} published: ${words.length} words, ${solveMs} ms solve.` }, saved.etag);
    return { outcome: 'published', puzzle: grid.puzzle, words: words.length, solveMs, comparison: snapshot.comparison };
  }
  async function rollback() {
    const { value, etag } = await repo.control();
    if (!value?.snapshotKey) throw new Error('No preview generation to roll back.');
    const previous = value.previous || {};
    await repo.commit({ ...previous, previous: { stateKey: value.stateKey, snapshotKey: value.snapshotKey, active: value.active, generation: value.generation }, lastCheck: clock().toISOString(), message: 'Admin restored the previous preview generation.' }, etag);
    return { outcome: 'restored' };
  }
  async function backup() {
    const { value } = await repo.control();
    const state = await stateFor(value);
    const revisions = {};
    for (const key of Object.values(state.revisions)) revisions[key] = await repo.read(key);
    return { schemaVersion: 1, exportedAt: clock().toISOString(), baselineVersion: baseline.sourceVersion, control: value, state, revisions, snapshot: await current() };
  }
  return { current, unseenWords, check, rollback, backup };
}
