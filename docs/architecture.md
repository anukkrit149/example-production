# How the example is put together

A piece has one identity for its whole life. The office plans it. The floor
records what happened. Current status is derived from an append-only event
log. `packages/domain` decides which event is legal in which state.
`packages/server` performs that decision. The apps do not invent a second set
of rules.

## States

`PLANNED` becomes `CUT_PENDING_QA` when the floor activates the piece.
Cutting, pasting, stitching, finishing, and a final QC each have a pending
check and a passed state. Pasting, stitching, and finishing also have a
custody state while the piece is out of the store. From a passed state the
piece can be packed and then shipped. Hold, reject, and cancel are explicit
events. `packages/domain/src/piece-state.ts` is the list.

## Checklists

Every gated step has a published checklist: confirm, measure, or photo.
A program may override one step. Publishing writes a new version and leaves
the previous version in place, so a piece keeps the questions it was asked.

## Sign-in

Office sample users are rows in `users`. With `DEV_AUTH=true`, `/dev-login`
picks one. An address on `factory.example` is the sample auto-admin domain.
That name is reserved for examples. It is not a company and not a host you
can open.

Floor operators use a card or a short code. The database stores a hash.
The card QR puts the token in the URL fragment.

## Data on this machine

`infra/compose.yaml` starts Postgres and MinIO on `127.0.0.1` only.
Photos are sample uploads in the local bucket. The apps never need a public
object store to run this example.

## Apps

`apps/web` is the phone. `apps/dashboard` is the desk. `apps/portal` is an
empty shell for a later buyer view and currently shows one placeholder page.
