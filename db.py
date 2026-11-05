import os
import time
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://hercity:hercity_dev_password@localhost:5433/hercity",
)

SCHEMA = """
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS community_reports (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'unverified',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    geom geometry(Point, 4326)
);
CREATE INDEX IF NOT EXISTS reports_geom_idx
ON community_reports USING GIST (geom);
CREATE OR REPLACE FUNCTION set_report_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reports_geom_trigger ON community_reports;
CREATE TRIGGER reports_geom_trigger
BEFORE INSERT OR UPDATE OF latitude, longitude ON community_reports
FOR EACH ROW EXECUTE FUNCTION set_report_geom();
"""

def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=5)

def init_db():
    error = None
    for _ in range(25):
        try:
            with connect() as conn:
                conn.execute(SCHEMA)
            return
        except Exception as exc:
            error = exc
            time.sleep(2)
    raise RuntimeError(f"PostgreSQL connection failed: {error}")
