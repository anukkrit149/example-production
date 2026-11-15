-- Enums
CREATE TYPE "LabelKind" AS ENUM ('planned', 'stage');
CREATE TYPE "ChecklistStep" AS ENUM ('activate', 'qa', 'issue', 'receive', 'pack', 'ship');
CREATE TYPE "ChecklistItemKind" AS ENUM ('confirm', 'photo', 'materials');

-- Labels: a kind, and stage becomes optional (null for planned)
ALTER TABLE "label_prints" ADD COLUMN "kind" "LabelKind" NOT NULL DEFAULT 'stage';
ALTER TABLE "label_prints" ALTER COLUMN "stage" DROP NOT NULL;
DROP INDEX IF EXISTS "label_prints_printed_at_stage_idx";
CREATE INDEX "label_prints_printed_at_kind_stage_idx" ON "label_prints"("printed_at", "kind", "stage");

ALTER TABLE "export_batches" ADD COLUMN "kind" "LabelKind" NOT NULL DEFAULT 'stage';
ALTER TABLE "export_batches" ALTER COLUMN "stage" DROP NOT NULL;

-- Checklists
CREATE TABLE "checklists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "step" "ChecklistStep" NOT NULL,
    "stage" "Stage",
    "category" TEXT NOT NULL,
    "program_id" UUID,
    "scope_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checklists_scope_key_key" ON "checklists"("scope_key");
CREATE INDEX "checklists_program_id_idx" ON "checklists"("program_id");
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "checklist_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklist_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checklist_versions_checklist_id_number_key" ON "checklist_versions"("checklist_id", "number");
-- At most one draft per checklist.
CREATE UNIQUE INDEX "checklist_versions_one_draft" ON "checklist_versions"("checklist_id") WHERE "published_at" IS NULL;
ALTER TABLE "checklist_versions" ADD CONSTRAINT "checklist_versions_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_versions" ADD CONSTRAINT "checklist_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ChecklistItemKind" NOT NULL DEFAULT 'confirm',
    "text_en" TEXT NOT NULL,
    "text_hi" TEXT NOT NULL,
    "pictogram" TEXT NOT NULL,
    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checklist_items_version_id_position_key" ON "checklist_items"("version_id", "position");
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "checklist_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
