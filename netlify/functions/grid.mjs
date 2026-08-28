import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "babble-shared-data", consistency: "strong" });

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const saved = await store().get("current-grid", { type: "json" });
  if (!saved) {
    return Response.json({ error: "No grid has been grabbed yet" }, { status: 404 });
  }

  return Response.json(saved, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/grid" };
