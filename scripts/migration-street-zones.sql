-- Add SMS shortcode column to zones table
ALTER TABLE zones ADD COLUMN IF NOT EXISTS sms_shortcode TEXT;

-- Create street_zones lookup table for GPS zone detection
CREATE TABLE IF NOT EXISTS street_zones (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id           TEXT    NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  street_name       TEXT    NOT NULL,
  street_normalized TEXT    NOT NULL,
  zone_name         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_street_zones_lookup
  ON street_zones (city_id, street_normalized);

-- Public read access (no login required to look up zones)
ALTER TABLE street_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS street_zones_public_read ON street_zones;
CREATE POLICY street_zones_public_read
  ON street_zones FOR SELECT USING (true);
