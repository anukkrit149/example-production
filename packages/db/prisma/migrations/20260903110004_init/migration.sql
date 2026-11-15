-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('buyer', 'agent');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'store', 'qa', 'supervisor', 'merchandiser', 'management');

-- CreateEnum
CREATE TYPE "WorkerType" AS ENUM ('cutter', 'paster', 'tailor', 'finisher');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('mens', 'womens', 'unisex', 'kids');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('cutting', 'pasting', 'stitching', 'finishing', 'qc', 'packaging');

-- CreateEnum
CREATE TYPE "PieceState" AS ENUM ('PLANNED', 'CUT_PENDING_QA', 'CUT_OK', 'WITH_PASTING', 'PASTED_PENDING_QA', 'PASTE_OK', 'WITH_STITCHING', 'STITCHED_PENDING_QA', 'STITCH_OK', 'WITH_FINISHING', 'FINISHED_PENDING_QA', 'FINISH_OK', 'QC_OK', 'PACKED', 'SHIPPED', 'ON_HOLD', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PieceEventType" AS ENUM ('PIECE_ACTIVATED', 'STAGE_QA_PASSED', 'STAGE_QA_FAILED', 'REWORK_ASSIGNED', 'ISSUED', 'RECEIVED', 'FIRST_PIECE_APPROVED', 'PIECE_HELD', 'PIECE_RELEASED', 'PIECE_REJECTED', 'PIECE_REPLACED', 'PIECE_CANCELLED', 'COMPONENT_ADJUSTED', 'CORRECTION', 'LABEL_PRINT_REQUESTED', 'LABEL_REPRINT_REQUESTED', 'PACKED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "LabelTemplate" AS ENUM ('t50x25', 't50x50');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buyer_id" UUID NOT NULL,
    "agent_id" UUID,
    "name" TEXT NOT NULL,
    "season" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "styles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "style_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "owner_id" UUID,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    "size" TEXT NOT NULL,
    "shade" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "line_item_id" UUID NOT NULL,
    "qr_token" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "state" "PieceState" NOT NULL DEFAULT 'PLANNED',
    "worker_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "piece_id" UUID NOT NULL,
    "event_type" "PieceEventType" NOT NULL,
    "stage" "Stage",
    "user_id" UUID NOT NULL,
    "worker_id" UUID,
    "group_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "piece_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "piece_event_id" UUID,
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "taken_by" UUID NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_prints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "piece_id" UUID NOT NULL,
    "stage" "Stage" NOT NULL,
    "template" "LabelTemplate" NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "export_batch_id" UUID,
    "printed_at" TIMESTAMP(3),
    "reprint_reason" TEXT,

    CONSTRAINT "label_prints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "format" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "label_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" TIMESTAMP(3),
    "copies" INTEGER,

    CONSTRAINT "export_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "auth_identity" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "WorkerType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "styles_style_code_key" ON "styles"("style_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_program_id_order_number_key" ON "orders"("program_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_items_order_id_style_id_size_shade_key" ON "order_line_items"("order_id", "style_id", "size", "shade");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_qr_token_key" ON "pieces"("qr_token");

-- CreateIndex
CREATE INDEX "pieces_state_idx" ON "pieces"("state");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_line_item_id_serial_key" ON "pieces"("line_item_id", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "piece_events_idempotency_key_key" ON "piece_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "piece_events_piece_id_created_at_idx" ON "piece_events"("piece_id", "created_at");

-- CreateIndex
CREATE INDEX "piece_events_group_id_idx" ON "piece_events"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "label_prints_printed_at_stage_idx" ON "label_prints"("printed_at", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_identity_key" ON "users"("auth_identity");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "styles" ADD CONSTRAINT "styles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "order_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_events" ADD CONSTRAINT "piece_events_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_events" ADD CONSTRAINT "piece_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_events" ADD CONSTRAINT "piece_events_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_piece_event_id_fkey" FOREIGN KEY ("piece_event_id") REFERENCES "piece_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_taken_by_fkey" FOREIGN KEY ("taken_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_export_batch_id_fkey" FOREIGN KEY ("export_batch_id") REFERENCES "export_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_batches" ADD CONSTRAINT "export_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
