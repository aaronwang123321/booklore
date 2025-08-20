-- CreateTable
CREATE TABLE "file_transactions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "operations" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rollbackAt" TIMESTAMP(3),

    CONSTRAINT "file_transactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "file_transactions" ADD CONSTRAINT "file_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
