import { Fragment, useEffect, useMemo, useState } from "react";

type Clue = { word: string; start: string; length: number; score: number };
type GridResponse = { letters: string; puzzle: string | null; date?: string | null; changed?: boolean };

const values: Record<string, number> = {
  A: 1, B: 3, C: 2, D: 2, E: 1, F: 4, G: 3, H: 2, I: 1,
  J: 8, K: 5, L: 1, M: 2, N: 1, O: 1, P: 2, Q: 5, Qu: 5, R: 1,
  S: 1, T: 1, U: 2, V: 4, W: 5, X: 8, Y: 3, Z: 10,
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

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function App() {
  const [grid, setGrid] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"all" | "on" | "off">("all");
  const [found, setFound] = useState<string[]>([]);
  const [status, setStatus] = useState("Checking saved word list…");
  const [puzzle, setPuzzle] = useState<string | null>(null);
  const [puzzleDate, setPuzzleDate] = useState<string | null>(null);
  const board = grid
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 25)
    .padEnd(25, "·")
    .split("")
    .map((letter) => letter === "Q" ? "Qu" : letter);

  useEffect(() => {
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

      try {
        const response = await fetch("/api/grid", { cache: "no-store" });
        let data = await readJson<GridResponse>(response);
        if (!isValidPuzzleDate(data.date)) {
          const refresh = await fetch("/api/grab", { cache: "no-store" });
          if (refresh.ok) data = await readJson<GridResponse>(refresh);
        }
        setGrid(data.letters);
        setPuzzle(data.puzzle);
        setPuzzleDate(data.date ?? null);
      } catch {
        // A first visitor can populate the shared grid with Grab Grid.
      }
    }
    void initialise();
  }, []);

  useEffect(() => {
    if (!puzzle) return;
    try {
      setFound(JSON.parse(localStorage.getItem(`babblekey-found-${puzzle}`) || "[]"));
    } catch {
      setFound([]);
    }
  }, [puzzle]);

  useEffect(() => {
    if (words.length && grid.replace(/[^A-Z]/gi, "").length === 25) solve();
  }, [words, grid]);

  const visible = useMemo(
    () => clues.filter((clue) =>
      clue.start.includes(filter.toUpperCase()) &&
      (view === "all" || (view === "on" ? found.includes(clue.word) : !found.includes(clue.word))),
    ),
    [clues, filter, view, found],
  );

  const counts = useMemo(
    () => [4, 5, 6, 7, 8, 9].map((length) => {
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

  async function grab() {
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
  }

  function toggle(word: string) {
    const next = found.includes(word) ? found.filter((item) => item !== word) : [...found, word];
    setFound(next);
    if (puzzle) localStorage.setItem(`babblekey-found-${puzzle}`, JSON.stringify(next));
  }

  return (
    <main id="top" className="page">
      <header>
        <h1>lickety&apos;s AI generated Babble Clues</h1>
        <p>
          Check boxes &amp; type-in boxes for the word if you think it&apos;s the one.{" "}
          <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">Visit lickety&apos;s original clues</a>
        </p>
      </header>

      <div className="content">
        <section className="left">
          <div className="toplinks">
            <a href="#clues"><b>AI Generated Clues</b></a>
            <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer"><b>lickety&apos;s Clues Page</b></a>
          </div>
          <h2>Babble Clues {puzzle ? `for Puzzle ${puzzle}${puzzleDate ? ` - ${formatPuzzleDate(puzzleDate)}` : ""}` : "for Today"}</h2>
          <div className="controlrow">
            <label className="upload">
              {words.length ? "Replace Lists" : "Load Lists"}
              <input type="file" accept=".csv,.txt" multiple onChange={(event) => void load(event.target.files)} />
            </label>
            <button type="button" onClick={() => void grab()}>Grab Grid</button>
          </div>
          <p className="status">{status}</p>
          <div className="showline">
            Show&nbsp;
            <label><input type="radio" name="view" checked={view === "all"} onChange={() => setView("all")} />All</label>&nbsp;
            <label><input type="radio" name="view" checked={view === "on"} onChange={() => setView("on")} />On</label>&nbsp;
            <label><input type="radio" name="view" checked={view === "off"} onChange={() => setView("off")} />Off</label>
          </div>
          <div className="totals">
            Total&nbsp; :{clues.length}&nbsp; On&nbsp; :{found.length}&nbsp; Off&nbsp; :{Math.max(0, clues.length - found.length)}
          </div>
          <div id="clues" className="find">
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
                      <td><input className="answer" aria-label={`Answer beginning ${clue.start}`} defaultValue={clue.start.toLowerCase()} /></td>
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
        </section>

        <section className="middle">
          <div className="board">
            {board.map((letter, index) => <i key={index}><b>{letter}</b><small>{values[letter] || ""}</small></i>)}
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
        </section>

        <aside>
          <div className="heart" aria-label="Lickety logo" />
          <div className="promo" aria-label="Babble — come join in the fun" />
          <p className="support">▣ Please Support Babble<br />and upgrade to Pro.</p>
          <h3>Handy Links</h3>
          <a href="https://www.playbabble.com/" target="_blank" rel="noreferrer">Babble</a>
          <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">lickety&apos;s Babble Clues</a>
          <a href="#top">AI Clues — Back to top</a>
          <h3>Word Lists</h3>
          <span>{words.length.toLocaleString()} saved words</span>
        </aside>
      </div>
    </main>
  );
}
