-- 为books表添加全文搜索支持

-- 添加搜索向量列
ALTER TABLE "books" ADD COLUMN "search_vector" tsvector;

-- 创建更新搜索向量的函数
CREATE OR REPLACE FUNCTION update_book_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.author, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.publisher, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.genres, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER books_search_vector_update
  BEFORE INSERT OR UPDATE ON "books"
  FOR EACH ROW EXECUTE FUNCTION update_book_search_vector();

-- 为现有数据更新搜索向量
UPDATE "books" SET "search_vector" = 
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(author, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(publisher, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(genres, ' '), '')), 'D');

-- 创建搜索向量的GIN索引
CREATE INDEX "books_search_vector_idx" ON "books" USING gin("search_vector");

-- 创建其他有用的搜索索引
CREATE INDEX "books_title_idx" ON "books" USING gin(to_tsvector('english', title));
CREATE INDEX "books_author_idx" ON "books" USING gin(to_tsvector('english', author));
CREATE INDEX "books_library_id_idx" ON "books"("libraryId");
CREATE INDEX "books_shelf_id_idx" ON "books"("shelfId");
CREATE INDEX "books_file_type_idx" ON "books"("fileType");
CREATE INDEX "books_status_idx" ON "books"(status);
CREATE INDEX "books_publish_date_idx" ON "books"("publishDate");
CREATE INDEX "books_created_at_idx" ON "books"("createdAt");

-- 创建复合索引用于常见查询
CREATE INDEX "books_library_status_idx" ON "books"("libraryId", status);
CREATE INDEX "books_library_shelf_idx" ON "books"("libraryId", "shelfId");
CREATE INDEX "books_library_created_idx" ON "books"("libraryId", "createdAt");
