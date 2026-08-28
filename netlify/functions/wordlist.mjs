import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "babble-shared-data", consistency: "strong" });

export default async (request) => {
  const dataStore = store();

  if (request.method === "GET") {
    const saved = await dataStore.get("words.txt");
    if (!saved) return new Response("", { status: 404 });
    return new Response(saved, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method === "POST") {
    const adminKey = process.env.WORDLIST_ADMIN_KEY;
    if (adminKey && request.headers.get("x-admin-key") !== adminKey) {
      return Response.json({ error: "An admin key is required to replace the word list" }, { status: 403 });
    }

    const body = await request.text();
    const words = body
      .split(/\r?\n/)
      .map((word) => word.trim().toUpperCase())
      .filter((word) => /^[A-Z]{4,25}$/.test(word));
    const unique = [...new Set(words)];

    if (!unique.length) {
      return Response.json({ error: "No valid words supplied" }, { status: 400 });
    }
    if (unique.length > 500000) {
      return Response.json({ error: "Word list is too large" }, { status: 413 });
    }

    await dataStore.set("words.txt", unique.join("\n"));
    return Response.json({ ok: true, count: unique.length });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const config = { path: "/api/wordlist" };
