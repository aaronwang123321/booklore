-- AlterTable
ALTER TABLE "books" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "rating" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "metadata_history" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "metadata_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "metadata_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "metadata_history" ADD CONSTRAINT "metadata_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_history" ADD CONSTRAINT "metadata_history_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_templates" ADD CONSTRAINT "metadata_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
