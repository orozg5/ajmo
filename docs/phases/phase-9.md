# Phase 9 — Hardening + observability

**Exit bar**: CI green on every PR; error budget instrumented; rate limits in place on AI endpoints; structured logs in backend; app is ready for real users.

## In scope

### E2E tests (Playwright)

- [ ] Auth: sign up → confirm email → sign in → sign out.
- [ ] Create plan: wizard 4 steps → plan shown on dashboard.
- [ ] Invite + collab: owner invites, invitee joins, both edit, see each other's cursor.
- [ ] Offline: go offline, edit, reconnect, merge clean.
- [ ] Social: add friend, comment, react, rate.

### Unit tests (pytest)

- [ ] AI services: `enrichment.py`, `suggestions.py`, `transport.py` against mocked Tavily + LLM. Cover the correctness cases from Phase 1 smoke.
- [ ] Materializer: fixture Yjs doc → diff against relational → assert upserts.
- [ ] Canonicalization / slug alias: fixture raw slugs → expected canonical mappings.
- [ ] RLS sanity: pytest against Supabase local — log in as user A, assert zero rows returned for user B's private plan.

### CI (GitHub Actions)

- [ ] `lint`: `eslint` + `ruff`.
- [ ] `typecheck`: `tsc --noEmit` + `mypy backend/`.
- [ ] `test-frontend`: Playwright headless against preview.
- [ ] `test-backend`: pytest.

### Observability

- [ ] Sentry DSN wired in frontend, backend, and collab service.
- [ ] Structured logging with `structlog` in backend; JSON-formatted lines.
- [ ] Health + readiness probes: `/healthz` (liveness), `/readyz` (dependencies check — DB, Supabase, LLM providers reachable).

### Rate limits

- [ ] AI endpoints: token-bucket per-user + per-IP. Defaults: 10 req / min / user for enrich + suggestions; 20 req / min / user for autocomplete.
- [ ] Backend middleware: return `429` with `Retry-After` header when exceeded.
- [ ] Frontend: toast with "You're going too fast, try again in Xs."

### Security review

- [ ] RLS policies audited — every frontend-readable table has a positive policy; every write path checked.
- [ ] Service-role key never reaches frontend — grep.
- [ ] Signed upload URLs expire ≤ 5 min.
- [ ] CSP header set on the Next.js app.

## Out of scope

- Multi-region failover.
- Billing / paid tiers.
- Admin dashboards.

## Verification

- CI green on a fresh PR.
- Sentry receives events from a forced error in each service.
- Burst 30 req/s at `/ai/suggestions` → 429s with `Retry-After`.
- Playwright full suite passes headless under 10 min.
- Manual pentest: open DevTools → try to fetch `plans` I'm not a member of → empty response.
