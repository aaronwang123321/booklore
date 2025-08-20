/*
  Warnings:

  - You are about to alter the column `search_vector` on the `books` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("tsvector")` to `Text`.

*/
-- DropIndex
DROP INDEX "books_created_at_idx";

-- DropIndex
DROP INDEX "books_file_type_idx";

-- DropIndex
DROP INDEX "books_library_created_idx";

-- DropIndex
DROP INDEX "books_library_id_idx";

-- DropIndex
DROP INDEX "books_library_shelf_idx";

-- DropIndex
DROP INDEX "books_library_status_idx";

-- DropIndex
DROP INDEX "books_publish_date_idx";

-- DropIndex
DROP INDEX "books_search_vector_idx";

-- DropIndex
DROP INDEX "books_shelf_id_idx";

-- DropIndex
DROP INDEX "books_status_idx";

-- AlterTable
ALTER TABLE "books" ALTER COLUMN "search_vector" SET DATA TYPE TEXT;
