-- Add tsvector column for full-text search
ALTER TABLE media ADD COLUMN search_vector tsvector;

-- Backfill existing rows
UPDATE media SET search_vector =
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(ocr_text, ''));

-- GIN index for fast @@ queries
CREATE INDEX idx_media_search_vector ON media USING GIN (search_vector);

-- Trigger function to keep search_vector in sync
CREATE OR REPLACE FUNCTION media_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.ocr_text, ''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER media_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, ocr_text ON media
  FOR EACH ROW EXECUTE FUNCTION media_search_vector_update();
