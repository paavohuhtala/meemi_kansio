DROP TRIGGER IF EXISTS media_search_vector_trigger ON media;
DROP FUNCTION IF EXISTS media_search_vector_update();
DROP INDEX IF EXISTS idx_media_search_vector;
ALTER TABLE media DROP COLUMN IF EXISTS search_vector;
