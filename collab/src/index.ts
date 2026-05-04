// Ajmo collab service — Hocuspocus Yjs websocket server.
// Phase 0 scaffold only: auth + persistence extensions land in Phase 6.

const port = Number(process.env.HOCUSPOCUS_PORT ?? 1234);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  requireEnv("BACKEND_AUTHORIZE_URL");
  requireEnv("BACKEND_SHARED_SECRET");

  console.log(`[ajmo-collab] scaffold ready on port ${port} — Hocuspocus server wiring lands in Phase 6.`);
}

main().catch((err) => {
  console.error("[ajmo-collab] fatal:", err);
  process.exit(1);
});
