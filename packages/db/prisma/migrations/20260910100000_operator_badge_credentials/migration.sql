-- ID-card badges: a second kind of operator credential, in the same table.
--
-- Existing rows are all typed codes, which is exactly what the default says, so
-- this backfills without a data migration and without a table rewrite beyond
-- the column add itself.
CREATE TYPE "OperatorCredentialKind" AS ENUM ('code', 'badge');

ALTER TABLE "operator_codes"
  ADD COLUMN "kind" "OperatorCredentialKind" NOT NULL DEFAULT 'code';
