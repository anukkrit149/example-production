-- One reference photo per style, kept in the attachments table the floor's QA photos use.
ALTER TABLE "styles" ADD COLUMN "reference_attachment_id" UUID;
CREATE UNIQUE INDEX "styles_reference_attachment_id_key" ON "styles"("reference_attachment_id");
ALTER TABLE "styles" ADD CONSTRAINT "styles_reference_attachment_id_fkey" FOREIGN KEY ("reference_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
