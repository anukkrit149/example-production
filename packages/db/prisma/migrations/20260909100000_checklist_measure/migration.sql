-- Measurement questions: a number with a unit and an optional inclusive tolerance.
ALTER TYPE "ChecklistItemKind" ADD VALUE 'measure';
ALTER TABLE "checklist_items" ADD COLUMN "unit" TEXT;
ALTER TABLE "checklist_items" ADD COLUMN "min" DECIMAL(10,2);
ALTER TABLE "checklist_items" ADD COLUMN "max" DECIMAL(10,2);
