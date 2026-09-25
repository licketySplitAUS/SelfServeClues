import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "babble-shared-data", consistency: "strong" });

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const page = await fetch("https://www.playbabble.com/", {
      headers: { "user-agent": "LicketysBabbleClues/1.0 (+Netlify)" },
    });
    if (!page.ok) {
      return Response.json({ error: "PlayBabble is unavailable" }, { status: 502 });
    }

    const html = await page.text();
    const letters = [...html.matchAll(/\/images\/([a-z])\.gif/gi)]
      .slice(0, 25)
      .map((match) => match[1].toUpperCase())
      .join("");
    const puzzleMatch = html.match(/\/([0-9]+)\/(\d{2})\/(\d{2})\/(\d{4})#chat_log/);
    const puzzle = puzzleMatch?.[1] ?? null;
    const date = puzzleMatch ? `${puzzleMatch[4]}-${puzzleMatch[2]}-${puzzleMatch[3]}` : null;

    if (letters.length !== 25) {
      return Response.json({ error: "Could not read today’s grid" }, { status: 502 });
    }

    const dataStore = store();
    const previous = await dataStore.get("current-grid", { type: "json" });
    if (!previous || previous.letters !== letters || previous.puzzle !== puzzle || previous.date !== date) {
      const nextGrid = { letters, puzzle, date, grabbedAt: new Date().toISOString() };
      await dataStore.setJSON("current-grid", nextGrid);
      return Response.json({ ...nextGrid, changed: true });
    }

    return Response.json({ ...previous, changed: false });
  } catch (error) {
    console.error("Grab Grid failed", error);
    return Response.json({ error: "Could not contact PlayBabble" }, { status: 502 });
  }
};

export const config = { path: "/api/grab" };
