# Example production software

A local example of production software for a garment factory. One piece is
planned in the office, cut and checked on the floor, then packed and shipped.
The sample factory is called Sample Factory. Nothing in this repository is a
live factory, a hosted app, or a record of a real person.

The license is [BSD-2-Clause](LICENSE).

## What runs locally

| Piece | Where | What it is |
| --- | --- | --- |
| Floor phone | `apps/web` on port 3000 | Scan a piece, walk a checklist, sign in with a sample card or code |
| Office dashboard | `apps/dashboard` on port 3002 | Programs, orders, labels, checklists, team |
| Portal shell | `apps/portal` on port 3001 | Placeholder. It has no accounts and no data |
| Rules | `packages/domain` | Piece states and checklist rules, with no database |
| Inputs | `packages/contracts` | The shapes the apps accept |
| Use cases | `packages/server` | What the floor and the office are allowed to do |
| Database | `packages/db` | Schema, migrations, and sample seed |
| Labels | `packages/labels` | Print export for the sample label stock |
| Shared UI | `packages/ui` | Shared interface pieces |

Postgres and the photo bucket stay on this machine. `infra/compose.yaml`
binds both to `127.0.0.1`.

## Run it

```bash
nvm use
cp .env.example .env
docker compose -f infra/compose.yaml up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Floor: http://localhost:3000
- Portal shell: `pnpm dev:portal` at http://localhost:3001
- Dashboard: `pnpm dev:dashboard` at http://localhost:3002

Next reads `.env` from `apps/web`, not the repo root. Either link it
(`ln -s ../../.env apps/web/.env`) or load it first
(`set -a && . .env && set +a && pnpm dev`).

`DEV_AUTH=true` in `.env.example` turns on `/dev-login`, which signs in as any
seeded sample user. Leave the auth base URL blank. This example does not use
a hosted sign-in service.

The seed is fictional: buyers, styles, and workers named by role (`Cutter One`,
`Paster One`, and so on). Do not replace it with real staff, real customers,
or real orders.

### Floor sign-in

Two sample doors, both issued from `/admin/operators`:

- **ID card.** Cards render at CR80 size. The QR carries the token in the URL
  fragment, so the token is not sent to the server and does not land in an
  access log. A browser on this machine opens `/badge` and signs in.
- **Typed code.** Eight characters, entered once at `/signin`.

Both are stored only as a SHA-256 hash. Revoking one also revokes the sample
sessions that came from it.

A camera needs a secure page. For a phone on your own network:

```bash
pnpm --filter @hf/web dev --experimental-https
```

Without that, the scan screen still accepts a typed code.

Each card uses `APP_URL` when it is set, and otherwise the address of the
request that issued it. Leave `APP_URL` blank for local use. Do not point it
at a public host.

### What the floor records

The phone remembers हिं | EN per browser. A planned label opens `activate`.
Activate, QA, issue, receive, pack, and ship each run a versioned checklist:
one item per screen, a pictogram, and yes or no. Pack and ship are
`/pieces/[id]/do/pack` and `/ship`.

### What the office plans

`/labels` lists planned and stage label batches. `/checklists` edits the
factory default for each step, then publishes a new version. A program can
override one step without changing the default other programs use.

## Tests

Three local databases, each with `test` in the name: `hf_test`, `hf_test_web`,
and `hf_test_dashboard`. Apply migrations to each, then:

```bash
pnpm test

DATABASE_URL=postgresql://hf:hf@127.0.0.1:5432/hf_test_web pnpm --filter @hf/web test:e2e
DATABASE_URL=postgresql://hf:hf@127.0.0.1:5432/hf_test_dashboard pnpm --filter @hf/dashboard test:e2e

pnpm test:all
```

The end-to-end suites start their own servers and refuse any database whose
name does not contain `test` or `e2e`, and any host that is not local. The
default database `hf` is refused for that reason.

## What this example leaves out

No deploy workflow, no hosted database, and no public app address. Secrets
stay in `.env`, which is gitignored. `.env.example` has only the local
defaults from `infra/compose.yaml`.

Do not commit names, email addresses, phone numbers, photos of real goods, or
a URL that is not `localhost`, `127.0.0.1`, or a reserved example name.

See [docs/architecture.md](docs/architecture.md) for how a piece moves, and
[CONTRIBUTING.md](CONTRIBUTING.md) for the rule on personal data.
