import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import LoadingClues from './LoadingClues';
import VisitCounter from './VisitCounter';
import InceptionDate from './InceptionDate';

type Clue = { word: string; start: string; length: number; score: number };
type GridResponse = { letters: string; puzzle: string | null; date?: string | null; changed?: boolean };
type BabbleBridge = Window & {
  AddBabbleWord?: (word: string) => string;
  GetAllWords?: () => string;
  showAll?: () => void;
  AddBulkWord?: () => void;
};

const values: Record<string, number> = {
  A: 1, B: 3, C: 2, D: 2, E: 1, F: 4, G: 3, H: 2, I: 1,
  J: 6, K: 5, L: 1, M: 2, N: 1, O: 1, P: 2, Q: 5, Qu: 5, R: 1,
  S: 1, T: 1, U: 2, V: 4, W: 5, X: 6, Y: 3, Z: 6,
};

function canTrace(word: string, board: string[]) {
  const walk = (index: number, position: number, used: Set<number>): boolean => {
    const tile = board[index];
    const nextPosition = position + (tile === "Qu" ? 2 : 1);
    if (tile === "Qu" ? word.slice(position, nextPosition) !== "QU" : tile !== word[position]) return false;
    if (nextPosition === word.length) return true;
    if (nextPosition > word.length) return false;

    used.add(index);
    const row = Math.floor(index / 5);
    const column = index % 5;
    for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
      for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;
        const next = nextRow * 5 + nextColumn;
        if (
          (rowStep || columnStep) &&
          nextRow >= 0 && nextRow < 5 &&
          nextColumn >= 0 && nextColumn < 5 &&
          !used.has(next) &&
          walk(next, nextPosition, new Set(used))
        ) return true;
      }
    }
    return false;
  };

  return board.some((_, index) => walk(index, 0, new Set()));
}

function scoreWord(word: string) {
  let score = 0;
  for (let index = 0; index < word.length; index += 1) {
    if (word[index] === "Q" && word[index + 1] === "U") {
      score += 5;
      index += 1;
    } else {
      score += values[word[index]] || 0;
    }
  }
  return score * (word.length - 3);
}

function isValidPuzzleDate(value: unknown) {
  if (typeof value !== "string") return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function formatPuzzleDate(value: string | null) {
  if (!isValidPuzzleDate(value)) return "";
  const [year, month, day] = value!.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${weekdays[date.getDay()]} ${day}${suffix} ${months[month - 1]} ${year}`;
}

function parseWords(text: string) {
  return [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.split(",")[0].trim().toUpperCase())
      .filter((word) => /^[A-Z]{4,25}$/.test(word) && word !== "WORD"),
  )];
}

function cleanBulkWord(line: string) {
  return line
    .replace(/\t/g, " ")
    .replace(/look up word/gi, "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z]/gi, "")
    .toUpperCase() || "";
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

type PublishedPuzzle = { puzzle: number; date: string; letters: string; words: { word: string; score: number }[] };
type AppProps = {
  publishedPuzzle?: PublishedPuzzle;
  onRefresh?: () => Promise<void>;
  statistics?: ReactNode;
  sidebarExtra?: ReactNode;
  dictionaryCount?: number;
};

export default function App({ publishedPuzzle, onRefresh, statistics, sidebarExtra, dictionaryCount }: AppProps = {}) {
  const printable = new URLSearchParams(window.location.search).get('print') === '1';
  const publicCluesPath = /^\/(?:babbleclues(?:\.html)?|new-babbleclues)\/?$/.test(window.location.pathname) ? window.location.pathname : null;
  const previewPath = publicCluesPath || '/history-preview.html';
  const selfServePath = publicCluesPath || window.location.pathname === '/selfserve-clues' ? '/selfserve-clues' : '/';
  const [grid, setGrid] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [initialising, setInitialising] = useState(!publishedPuzzle);
  const [hasSolved, setHasSolved] = useState(false);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"all" | "on" | "off">("all");
  const [found, setFound] = useState<string[]>([]);
  const [status, setStatus] = useState("Checking saved word list…");
  const [puzzle, setPuzzle] = useState<string | null>(null);
  const [puzzleDate, setPuzzleDate] = useState<string | null>(null);
  const [bulkWords, setBulkWords] = useState("");
  const [bulkAdded, setBulkAdded] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [entryWord, setEntryWord] = useState("");
  const [entryMessage, setEntryMessage] = useState("");
  const foundRef = useRef<string[]>([]);
  const grabInFlight = useRef(false);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const supportClicks = useRef({ count: 0, startedAt: 0 });
  const supportDestination = publishedPuzzle ? "/history-admin.html" : "/history-preview.html";
  useEffect(() => {
    if (!printable) return;
    document.body.classList.add('printable-page');
    document.title = "lickety's Printable Babble Clues";
    return () => document.body.classList.remove('printable-page');
  }, [printable]);
  function supportShortcut(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const now = performance.now();
    const clicks = supportClicks.current;
    if (!clicks.count || now - clicks.startedAt > 2000) {
      clicks.count = 0;
      clicks.startedAt = now;
    }
    clicks.count += 1;
    if (clicks.count === 5) {
      clicks.count = 0;
      window.location.assign(supportDestination);
    }
  }
  const board = grid
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 25)
    .padEnd(25, "·")
    .split("")
    .map((letter) => letter === "Q" ? "Qu" : letter);

  useEffect(() => {
    if (publishedPuzzle) return;
    async function initialise() {
      try {
        let response = await fetch("/api/wordlist", { cache: "no-store" });
        if (!response.ok) response = await fetch("/BabbleWordList.csv");
        if (!response.ok) throw new Error("Could not load the built-in word list");
        const loadedWords = parseWords(await response.text());
        setWords(loadedWords);
        setStatus(`${loadedWords.length.toLocaleString()} built-in words ready`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load the word list");
      }

      await grab(true);
      setInitialising(false);
    }
    void initialise();
  }, []);

  useEffect(() => {
    if (!publishedPuzzle) return;
    setGrid(publishedPuzzle.letters);
    setPuzzle(String(publishedPuzzle.puzzle));
    setPuzzleDate(publishedPuzzle.date);
    setWords(publishedPuzzle.words.map(row => row.word.toUpperCase()));
    setClues(publishedPuzzle.words.map(row => ({ word: row.word.toUpperCase(), start: row.word.slice(0, 2).toUpperCase(), length: row.word.length, score: row.score }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.word.localeCompare(b.word)));
    setStatus("Published clues loaded");
  }, [publishedPuzzle]);

  useEffect(() => {
    if (!puzzle) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`${publishedPuzzle ? 'babble-history-found' : 'babblekey-found'}-${puzzle}`) || "[]");
      foundRef.current = saved;
      setFound(saved);
    } catch {
      foundRef.current = [];
      setFound([]);
    }
  }, [puzzle]);

  useEffect(() => {
    foundRef.current = found;
    found.forEach(fillAnswer);
  }, [found, clues, view, filter]);

  useEffect(() => {
    if (!publishedPuzzle && words.length && grid.replace(/[^A-Z]/gi, "").length === 25) solve();
  }, [words, grid]);

  const visible = useMemo(
    () => clues.filter((clue) =>
      clue.start.includes(filter.toUpperCase()) &&
      (view === "all" || (view === "on" ? found.includes(clue.word) : !found.includes(clue.word))),
    ),
    [clues, filter, view, found],
  );

  const counts = useMemo(
    () => [...new Set([4, 5, 6, 7, 8, ...clues.map(clue => clue.length)])].sort((a, b) => a - b).map((length) => {
      const rows = clues.filter((clue) => clue.length === length);
      return {
        length,
        count: rows.length,
        score: rows.reduce((total, clue) => total + clue.score, 0),
      };
    }),
    [clues],
  );

  const longest = useMemo(
    () => [...clues].sort((a, b) => b.length - a.length || b.score - a.score).slice(0, 3),
    [clues],
  );

  const highest = useMemo(
    () => [...clues].sort((a, b) => b.score - a.score || b.length - a.length).slice(0, 3),
    [clues],
  );

  async function load(files: FileList | null) {
    if (!files) return;
    setStatus("Saving word lists…");
    const combined = (await Promise.all([...files].map((file) => file.text()))).join("\n");
    const unique = parseWords(combined);
    try {
      const request = (adminKey?: string) => fetch("/api/wordlist", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          ...(adminKey ? { "x-admin-key": adminKey } : {}),
        },
        body: unique.join("\n"),
      });
      let response = await request();
      if (response.status === 403) {
        const adminKey = window.prompt("Enter the word-list admin key:");
        if (!adminKey) throw new Error("Word-list replacement cancelled");
        response = await request(adminKey);
      }
      await readJson(response);
      setWords(unique);
      setClues([]);
      setStatus(`${unique.length.toLocaleString()} words saved for every visitor`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the word list");
    }
  }

  async function grab(automatic = false) {
    if (publishedPuzzle) { await onRefresh?.(); return; }
    if (grabInFlight.current) return;
    grabInFlight.current = true;
    setStatus("Checking today’s puzzle…");
    try {
      const response = await fetch("/api/grab", { cache: "no-store" });
      const data = await readJson<GridResponse>(response);
      setGrid(data.letters);
      setPuzzle(data.puzzle);
      setPuzzleDate(data.date ?? null);
      setStatus(data.changed ? "New grid saved for everyone" : "Shared grid is already current");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not grab the puzzle");
      if (automatic) {
        // Keep the last shared puzzle available when PlayBabble is offline.
        try {
          const data = await readJson<GridResponse>(await fetch("/api/grid", { cache: "no-store" }));
          setGrid(data.letters);
          setPuzzle(data.puzzle);
          setPuzzleDate(data.date ?? null);
        } catch { /* retain the currently displayed grid */ }
      }
    } finally {
      grabInFlight.current = false;
    }
  }

  function solve() {
    if (board.includes("·") || !words.length) return;
    setClues(
      words
        .filter((word) => canTrace(word, board))
        .map((word) => ({
          word,
          start: word.slice(0, 2),
          length: word.length,
          score: scoreWord(word),
        }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.word.localeCompare(b.word)),
    );
    setHasSolved(true);
  }

  function toggle(word: string) {
    const current = foundRef.current;
    const next = current.includes(word) ? current.filter((item) => item !== word) : [...current, word];
    foundRef.current = next;
    setFound(next);
    if (puzzle) localStorage.setItem(`${publishedPuzzle ? 'babble-history-found' : 'babblekey-found'}-${puzzle}`, JSON.stringify(next));
  }

  function fillAnswer(word: string) {
    const field = [...document.querySelectorAll<HTMLInputElement>("[data-answer-word]")]
      .find((input) => input.dataset.answerWord === word);
    if (field) field.value = word.toLowerCase();
  }

  function addBabbleWord(rawWord: string) {
    const word = String(rawWord || "").trim().toUpperCase();
    if (!clues.some((clue) => clue.word === word)) return "0";
    if (foundRef.current.includes(word)) {
      fillAnswer(word);
      return "2";
    }
    const next = [...foundRef.current, word];
    foundRef.current = next;
    setFound(next);
    if (puzzle) localStorage.setItem(`${publishedPuzzle ? 'babble-history-found' : 'babblekey-found'}-${puzzle}`, JSON.stringify(next));
    fillAnswer(word);
    return "1";
  }

  function addEnteredWord() {
    const word = entryWord.trim().toUpperCase();
    if (!word) return;
    const result = addBabbleWord(word);
    setView("all");
    if (result === "0") {
      setEntryMessage(`${word.toLowerCase()} is not in this puzzle.`);
    } else {
      setEntryWord("");
      setEntryMessage(result === "1" ? `${word.toLowerCase()} added.` : `${word.toLowerCase()} was already added.`);
    }
    wordInputRef.current?.focus();
  }

  function findEnteredWord() {
    const start = entryWord.trim().slice(0, 2).toUpperCase();
    setView("all");
    setFilter(start);
    setEntryMessage(start ? `Showing clues beginning ${start.toLowerCase()}.` : "Showing all clues.");
    document.getElementById("clues")?.scrollIntoView({ block: "start" });
    wordInputRef.current?.focus();
  }

  function getAllWords() {
    const text = clues
      .filter((clue) => foundRef.current.includes(clue.word))
      .map((clue) => clue.word.toLowerCase())
      .join("\n");
    const output = text ? `${text}\n` : "";
    setBulkAdded(output);
    return output;
  }

  function addBulkWords() {
    const list = bulkWords.split(/\r?\n/).map(cleanBulkWord).filter(Boolean);
    let added = 0;
    list.forEach((word) => {
      if (addBabbleWord(word) === "1") added += 1;
    });
    setView("all");
    setBulkWords("");
    setBulkMessage(`${list.length} words checked, and ${added} new words added.`);
  }

  async function pasteBulkWords() {
    try {
      setBulkWords(await navigator.clipboard.readText());
      setBulkMessage("Clipboard pasted.");
    } catch {
      document.querySelector<HTMLTextAreaElement>('textarea[name="bulkWords"]')?.focus();
      setBulkMessage("Click in the Bulk Add box and use your browser Paste command, or press Ctrl+V (Cmd+V on Mac).");
    }
  }

  async function copyBulkWords() {
    const text = getAllWords();
    try {
      await navigator.clipboard.writeText(text);
      setBulkMessage("Added words copied to the clipboard.");
    } catch {
      const field = document.querySelector<HTMLTextAreaElement>('textarea[name="bulkAdded"]');
      field?.focus();
      field?.select();
      document.execCommand("copy");
      setBulkMessage("Added words selected and copied.");
    }
  }

  useEffect(() => {
    const bridge = window as BabbleBridge;
    const externalAdd = (word: string) => addBabbleWord(word);
    const externalGet = () => getAllWords();
    const externalShow = () => setView("all");
    const externalBulk = () => addBulkWords();
    bridge.AddBabbleWord = externalAdd;
    bridge.GetAllWords = externalGet;
    bridge.showAll = externalShow;
    bridge.AddBulkWord = externalBulk;
    return () => {
      if (bridge.AddBabbleWord === externalAdd) delete bridge.AddBabbleWord;
      if (bridge.GetAllWords === externalGet) delete bridge.GetAllWords;
      if (bridge.showAll === externalShow) delete bridge.showAll;
      if (bridge.AddBulkWord === externalBulk) delete bridge.AddBulkWord;
    };
  }, [clues, puzzle, bulkWords]);

  if (!publishedPuzzle && (initialising || (!hasSolved && words.length > 0 && /^[A-Z]{25}$/i.test(grid)))) return <LoadingClues />;

  if (printable) return (
    <main className="printable-document">
      <div className="print-toolbar"><a href={publishedPuzzle ? previewPath : selfServePath}>Back to clues</a><button type="button" disabled={!clues.length} onClick={() => window.print()}>Print</button></div>
      <p className="print-credit">Printable Babble Clues&nbsp;&nbsp; <small>brought to you by licketySplitAUS</small></p>
      <InceptionDate />
      <h1>Babble Clues {puzzle ? `for Puzzle ${puzzle}${puzzleDate ? ` - ${formatPuzzleDate(puzzleDate)}` : ''}` : 'for Today'}</h1>
      {clues.length ? <div className="printable-clues">{clues.map((clue, index) => <Fragment key={clue.word}>
        {index > 0 && clues[index - 1].start !== clue.start && <div className="printable-gap" />}
        <div className="printable-clue">{clue.start.toLowerCase()}{clue.length},{clue.score}</div>
      </Fragment>)}</div> : <p role="status">{status}</p>}
    </main>
  );

  return (
    <main id="top" className="page">
      <header>
        <h1>{publishedPuzzle ? "lickety's Babble Clues" : "lickety's Self Serve Babble Clues"}</h1>
        <p>
          Check boxes &amp; type-in boxes for the word if you think it&apos;s the one.{" "}
          {!publishedPuzzle && <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">Visit lickety&apos;s original clues</a>}{" "}
        </p>
      </header>

      <div className="content">
        <div className="mainlead">
          {publishedPuzzle ? <>
            <div className="toplinks">
              <a href={`${previewPath}?print=1`} target="_blank" rel="noopener noreferrer"><b>Printable Clues (no boxes). Click here</b></a>
              <a href="#BulkAdd"><b>Bulk Add / Grab</b></a>
            </div>
            <a href={selfServePath}><b>Self Serve Clues</b></a>
          </> : <>
            <div className="toplinks">
              <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer"><b>lickety&apos;s Clues Page</b></a>
              <a href="#BulkAdd"><b>Bulk Add / Grab</b></a>
            </div>
            <a className="printable-link" href={`${selfServePath}?print=1`} target="_blank" rel="noopener noreferrer"><b>Printable Clues (no boxes). Click here</b></a>
          </>}
          <h2>Babble Clues {puzzle ? `for Puzzle ${puzzle}${puzzleDate ? ` - ${formatPuzzleDate(puzzleDate)}` : ""}` : "for Today"}</h2>
        </div>
        <section className="left">
          {!publishedPuzzle && <button className="grabgrid" type="button" onClick={() => void grab()}>Grab Grid</button>}
          {!publishedPuzzle && <div className="controlrow">
            <label className="upload">
              {words.length ? "Replace Lists" : "Load Lists"}
              <input type="file" accept=".csv,.txt" multiple onChange={(event) => void load(event.target.files)} />
            </label>
          </div>}
          <p className="status">{status}</p>
          <form className="wordentry" onSubmit={(event) => { event.preventDefault(); addEnteredWord(); }}>
            <label className="visuallyhidden" htmlFor="add-word">Add word</label>
            <input
              ref={wordInputRef}
              id="add-word"
              value={entryWord}
              maxLength={25}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setEntryWord(event.target.value.replace(/[^a-z]/gi, "").toLowerCase());
                setEntryMessage("");
              }}
            />
            <button className="erase" type="button" aria-label="Remove last letter" title="Remove last letter" onClick={() => { setEntryWord((word) => word.slice(0, -1)); wordInputRef.current?.focus(); }}>&lt;-</button>
            <button className="addword" type="submit">Add Word</button>
            <button className="findword" type="button" aria-label="Find this clue start" title="Find this clue start" onClick={findEnteredWord}>?</button>
          </form>
          <p className="entrymessage" aria-live="polite">{entryMessage}</p>
          <div className="showline">
            Show&nbsp;
            <label><input type="radio" name="view" checked={view === "all"} onChange={() => setView("all")} />All</label>&nbsp;
            <label><input type="radio" name="view" checked={view === "on"} onChange={() => setView("on")} />On</label>&nbsp;
            <label><input type="radio" name="view" checked={view === "off"} onChange={() => setView("off")} />Off</label>
          </div>
          <div className="totals">
            Total&nbsp; :{clues.length}&nbsp; On&nbsp; :{found.length}&nbsp; Off&nbsp; :{Math.max(0, clues.length - found.length)}
          </div>
          <div id="clues" className="find visuallyhidden">
            Find start: <input value={filter} onChange={(event) => setFilter(event.target.value)} maxLength={2} />
          </div>

          {clues.length ? (
            <table className="clues">
              <tbody>
                {visible.map((clue, index) => (
                  <Fragment key={clue.word}>
                    <tr className={found.includes(clue.word) ? "done" : ""}>
                      <td>{clue.start.toLowerCase()}{clue.length},{clue.score}</td>
                      <td>
                        <input
                          aria-label={`Mark ${clue.start} clue found`}
                          type="checkbox"
                          checked={found.includes(clue.word)}
                          onChange={() => toggle(clue.word)}
                        />
                      </td>
                      <td><input className="answer" data-answer-word={clue.word} aria-label={`Answer beginning ${clue.start}`} defaultValue={(found.includes(clue.word) ? clue.word : clue.start).toLowerCase()} /></td>
                      <td />
                    </tr>
                    {(index === visible.length - 1 || visible[index + 1].start !== clue.start) && (
                      <tr className="groupback"><td colSpan={4}><a href="#top">Back to top</a></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">Grab today&apos;s grid; clues are made automatically.</p>
          )}

          <form name="bulk" id="BulkAdd" className="bulk" onSubmit={(event) => { event.preventDefault(); addBulkWords(); }}>
            <h3>Bulk Add <small>(one per line)</small></h3>
            <p>Paste words copied from Babble. Extra columns and “Look Up Word” text are ignored.</p>
            <textarea name="bulkWords" rows={10} value={bulkWords} onChange={(event) => setBulkWords(event.target.value)} />
            <div className="bulkbuttons">
              <button type="submit">Add Bulk</button>
              <button type="button" onClick={() => void pasteBulkWords()}>Paste from Clipboard</button>
            </div>
            <h3 id="BulkGrab">Bulk Grab <small>(one per line)</small></h3>
            <p>Grab all words currently marked in this clues page so they can be sent to Babble or another clues page.</p>
            <textarea name="bulkAdded" rows={10} value={bulkAdded} readOnly />
            <div className="bulkbuttons">
              <button type="button" onClick={getAllWords}>Get all added Words</button>
              <button type="button" onClick={() => void copyBulkWords()}>Send to Clipboard</button>
            </div>
            <p className="bulkmessage" aria-live="polite">{bulkMessage}</p>
          </form>
        </section>

        <section className="middle">
          <div className="board">
            {board.map((letter, index) => (
              <button
                type="button"
                className="tile"
                key={index}
                aria-label={`Add ${letter}`}
                onClick={() => { setEntryWord((word) => (word + letter).toLowerCase()); wordInputRef.current?.focus(); }}
              >
                {letter === "·" ? <span /> : <img src={`/${letter[0].toLowerCase()}.gif`} alt="" />}
              </button>
            ))}
          </div>
          <div className="rule" />
          <h3>Word Counts</h3>
          <dl>
            {counts.filter((item) => item.count || item.length < 9).map((item) => (
              <div key={item.length}><dt>{item.length}-letter :</dt><dd>{item.count}</dd><dd>{item.score} pts</dd></div>
            ))}
            <div className="grand"><dt>Total :</dt><dd>{clues.length}</dd><dd>{clues.reduce((total, clue) => total + clue.score, 0)} pts</dd></div>
          </dl>
          <a className="back" href="#top">Back to top</a>
          <div className="rule" />
          <h3>Longest Top 3 Words</h3>
          {longest.map((clue) => <p key={clue.word}>{clue.start.toLowerCase()}{clue.length},{clue.score}</p>)}
          <a className="back" href="#top">Back to top</a>
          <div className="rule" />
          <h3>Top 3 Scoring Words</h3>
          {highest.map((clue) => <p key={clue.word}>{clue.start.toLowerCase()}{clue.length},{clue.score}</p>)}
          <a className="back" href="#top">Back to top</a>
          <div className="rule" />
          {statistics}
        </section>

        <aside>
          <p className="heart"><img src="/MyLogo.jpg" alt="Lickety logo" /></p>
          <a className="promo" href="https://www.playbabble.com/" target="_blank" rel="noreferrer"><img src="/babble.jpg" alt="Babble — come join in the fun" /></a>
          <p className="support">▣ Please <a className="support-shortcut" href={supportDestination} onClick={supportShortcut}>Support</a> Babble<br />and upgrade to Pro.</p>
          <div className="donation">
            <p>Don&apos;t need any assistance, but if you feel obliged to donate:</p>
            <a className="paypal-donate" href="https://www.paypal.com/donate/?business=licketySplitAUS%40gmail.com&amp;item_name=Lickety%27s%20Babble%20Clues&amp;currency_code=AUD" target="_blank" rel="noopener noreferrer">Donate with PayPal</a>
            <a className="donation-email" href="mailto:licketySplitAUS@gmail.com">licketySplitAUS@gmail.com</a>
          </div>
          <div className="expert-button-wrap"><a className="babble-expert-button" href="/babble-expert.html" target="_blank" rel="noopener noreferrer"><span>Babble Expert</span></a></div>
          <h3>Handy Links</h3>
          <a href="https://www.playbabble.com/" target="_blank" rel="noreferrer">Babble</a>
          <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">lickety&apos;s Babble Clues</a>
          <a href="#top">Back to top</a>
          <h3>Word Lists</h3>
          <nav className="word-list-links" aria-label="Word lists by length">
            {Array.from({ length: 9 }, (_, index) => index + 4).map(length =>
              <a key={length} href={`https://r46.me/words-${length}.html`} target="_blank" rel="noopener noreferrer">{length}-letter words</a>
            )}
          </nav>
          <span>{(dictionaryCount ?? words.length).toLocaleString()} saved words</span>
          <VisitCounter />
          {sidebarExtra}
          <div className="lickety-info-link"><a href="https://r46.me/lickety-info.html" target="_blank" rel="noopener noreferrer">Lickety Info</a></div>
        </aside>
      </div>
    </main>
  );
}
