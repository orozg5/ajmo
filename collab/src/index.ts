// Ajmo collab service — Hocuspocus Yjs WebSocket server.
//
// Per `collab/CLAUDE.md`:
// - The collab service is the only writer of `plans.yjs_state` (FastAPI never touches it).
// - Inbound websocket auth → POST /internal/collab/authorize on the backend.
// - On every Y.Doc change → fire-and-forget POST /internal/collab/changed.
// - Viewers connect read-only; their sync update messages are dropped server-side.
// - Cold load (yjs_state IS NULL) → GET /internal/collab/seed?plan_id=... and
//   apply the returned base64 update so the doc opens with current relational state.

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import pg from "pg";
import { fetch as undiciFetch } from "undici";

const port = Number(process.env.HOCUSPOCUS_PORT ?? 1234);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const DATABASE_URL = requireEnv("DATABASE_URL");
const BACKEND_AUTHORIZE_URL = requireEnv("BACKEND_AUTHORIZE_URL");
const BACKEND_CHANGED_URL = requireEnv("BACKEND_CHANGED_URL");
const BACKEND_SEED_URL = requireEnv("BACKEND_SEED_URL");
const BACKEND_SHARED_SECRET = requireEnv("BACKEND_SHARED_SECRET");

const pool = new pg.Pool({ connectionString: DATABASE_URL });

interface AuthorizeResponse {
  ok: boolean;
  role: "viewer" | "editor" | "owner";
  userId: string;
  planId: string;
}

interface SeedResponse {
  update_b64: string;
}

async function authorize(token: string, planId: string): Promise<AuthorizeResponse> {
  const res = await undiciFetch(BACKEND_AUTHORIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Collab-Secret": BACKEND_SHARED_SECRET,
    },
    body: JSON.stringify({ token, plan_id: planId }),
  });
  if (!res.ok) {
    throw new Error(`authorize failed: ${res.status}`);
  }
  return (await res.json()) as AuthorizeResponse;
}

async function fetchSeed(planId: string): Promise<Uint8Array | null> {
  const url = new URL(BACKEND_SEED_URL);
  url.searchParams.set("plan_id", planId);
  const res = await undiciFetch(url, {
    headers: { "X-Collab-Secret": BACKEND_SHARED_SECRET },
  });
  if (!res.ok) {
    console.warn(`[ajmo-collab] seed fetch failed for ${planId}: ${res.status}`);
    return null;
  }
  const body = (await res.json()) as SeedResponse;
  if (!body.update_b64) return null;
  return new Uint8Array(Buffer.from(body.update_b64, "base64"));
}

function notifyChanged(planId: string, userId: string | null): void {
  // Fire-and-forget — the backend debounces inside its own task; we don't
  // want to slow down message broadcast on the websocket.
  undiciFetch(BACKEND_CHANGED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Collab-Secret": BACKEND_SHARED_SECRET,
    },
    body: JSON.stringify({ plan_id: planId, user_id: userId }),
  }).catch((err) => {
    console.warn(`[ajmo-collab] notify changed failed: ${(err as Error).message}`);
  });
}

const server = new Server({
  port,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const result = await pool.query<{ yjs_state: Buffer | null }>(
          "SELECT yjs_state FROM plans WHERE id = $1",
          [documentName],
        );
        if (result.rowCount === 0) {
          throw new Error(`plan ${documentName} not found`);
        }
        const stored = result.rows[0]?.yjs_state ?? null;
        if (stored && stored.length > 0) {
          return new Uint8Array(stored);
        }
        return await fetchSeed(documentName);
      },
      store: async ({ documentName, state }) => {
        await pool.query("UPDATE plans SET yjs_state = $1 WHERE id = $2", [
          Buffer.from(state),
          documentName,
        ]);
      },
    }),
    new Logger(),
  ],
  async onAuthenticate({ token, documentName }) {
    if (!token) {
      throw new Error("missing token");
    }
    const result = await authorize(token, documentName);
    if (!result.ok) {
      throw new Error("unauthorised");
    }
    // readOnly=true makes Hocuspocus drop SyncUpdate messages from this socket
    // before they ever reach the doc — see Hocuspocus docs on the readOnly
    // flag from onAuthenticate. Frontend mirrors this gating in the UI.
    return {
      user: { id: result.userId, role: result.role },
      readOnly: result.role === "viewer",
    };
  },
  async onChange({ documentName, context }) {
    const userId =
      (context as { user?: { id?: string } } | undefined)?.user?.id ?? null;
    notifyChanged(documentName, userId);
  },
});

server.listen().then(() => {
  console.log(`[ajmo-collab] hocuspocus listening on port ${port}`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[ajmo-collab] received ${signal}, shutting down`);
  await server.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
