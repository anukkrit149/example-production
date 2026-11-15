-- CreateTable
CREATE TABLE "mutation_keys" (
    "key" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutation_keys_pkey" PRIMARY KEY ("key")
);
