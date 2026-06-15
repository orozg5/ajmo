// Smoke-test the Postgres connection. Override DB_PASSWORD env var to bypass URL parsing when DATABASE_URL fails.

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch (err) {
  console.error("Invalid DATABASE_URL:", err.message);
  process.exit(1);
}

const override = process.env.DB_PASSWORD;
const password = override ?? decodeURIComponent(parsed.password);

const config = {
  user: decodeURIComponent(parsed.username),
  password,
  host: parsed.hostname,
  port: Number(parsed.port || 5432),
  database: parsed.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
};

console.log("Connecting via fields (URL-encoding bypassed):");
console.log("  user:    ", config.user);
console.log("  host:    ", config.host);
console.log("  port:    ", config.port);
console.log("  database:", config.database);
console.log("  password:", password ? `*** (${password.length} chars)` : "<empty>");
if (override) console.log("  source:  DB_PASSWORD env override");

const client = new pg.Client(config);
try {
  await client.connect();
  const r = await client.query(
    "select current_user as user, inet_server_addr() as host, version() as version",
  );
  console.log("OK:", r.rows[0]);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
