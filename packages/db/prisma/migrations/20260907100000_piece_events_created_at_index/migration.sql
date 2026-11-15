-- The overview scans events by time on every refresh; the feed pages newest-first by (created_at, id).
CREATE INDEX "piece_events_created_at_id_idx" ON "piece_events"("created_at" DESC, "id" DESC);
