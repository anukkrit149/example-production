-- CreateTable
CREATE TABLE "piece_lineage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rejected_piece_id" UUID NOT NULL,
    "replacement_piece_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_lineage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "piece_lineage_rejected_piece_id_key" ON "piece_lineage"("rejected_piece_id");

-- AddForeignKey
ALTER TABLE "piece_lineage" ADD CONSTRAINT "piece_lineage_rejected_piece_id_fkey" FOREIGN KEY ("rejected_piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_lineage" ADD CONSTRAINT "piece_lineage_replacement_piece_id_fkey" FOREIGN KEY ("replacement_piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_lineage" ADD CONSTRAINT "piece_lineage_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "piece_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

