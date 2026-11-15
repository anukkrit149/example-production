-- Inventory receiving: items (configuration), receipts, their lines, and an append-only event log.
CREATE TYPE "InventoryReceiptStatus" AS ENUM ('RECEIVED', 'COUNTED');
CREATE TYPE "InventoryEventType" AS ENUM ('RECEIPT_RECORDED', 'RECEIPT_COUNTED');
CREATE TYPE "AttachmentPurpose" AS ENUM ('goods', 'place', 'document');

CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");

CREATE TABLE "inventory_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "InventoryReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "supplier" TEXT,
    "reference" TEXT,
    "location" TEXT,
    "note" TEXT,
    "has_discrepancy" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "received_by" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counted_by" UUID,
    "counted_at" TIMESTAMP(3),
    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_receipts_status_received_at_idx" ON "inventory_receipts"("status", "received_at" DESC);
CREATE INDEX "inventory_receipts_received_by_received_at_idx" ON "inventory_receipts"("received_by", "received_at" DESC);
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "inventory_receipt_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "expected_qty" INTEGER,
    "counted_qty" INTEGER,
    "added_at_count" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "inventory_receipt_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_receipt_lines_receipt_id_item_id_key" ON "inventory_receipt_lines"("receipt_id", "item_id");
CREATE INDEX "inventory_receipt_lines_item_id_idx" ON "inventory_receipt_lines"("item_id");
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "event_type" "InventoryEventType" NOT NULL,
    "user_id" UUID NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_events_idempotency_key_key" ON "inventory_events"("idempotency_key");
CREATE INDEX "inventory_events_receipt_id_created_at_idx" ON "inventory_events"("receipt_id", "created_at");
CREATE INDEX "inventory_events_created_at_id_idx" ON "inventory_events"("created_at" DESC, "id" DESC);
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A photo may now belong to a receipt instead of a piece event or a style.
ALTER TABLE "attachments" ADD COLUMN "inventory_receipt_id" UUID;
ALTER TABLE "attachments" ADD COLUMN "purpose" "AttachmentPurpose";
CREATE INDEX "attachments_inventory_receipt_id_idx" ON "attachments"("inventory_receipt_id");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_inventory_receipt_id_fkey" FOREIGN KEY ("inventory_receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
