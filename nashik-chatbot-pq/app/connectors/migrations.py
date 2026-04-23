"""
Database Migrations
Idempotent index migrations that run at startup using CREATE INDEX IF NOT EXISTS.
Safe to run on existing databases - skips already-existing indexes.
"""

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Each tuple: (index_name, table_name, columns_sql)
PART_LABELER_INDEXES = [
    # raw_warranty_data
    ("idx_raw_warranty_user_month",   "raw_warranty_data", "user_id, manufac_yr_mon"),
    ("idx_raw_warranty_user_model",   "raw_warranty_data", "user_id, base_model"),
    ("idx_raw_warranty_user_mis",     "raw_warranty_data", "user_id, mis_bucket"),
    ("idx_raw_warranty_user_qtr",     "raw_warranty_data", "user_id, new_manufacturing_quater"),
    # raw_rpt_data
    ("idx_raw_rpt_user_month",        "raw_rpt_data",      "user_id, mfg_month"),
    ("idx_raw_rpt_user_model",        "raw_rpt_data",      "user_id, model"),
    ("idx_raw_rpt_user_category",     "raw_rpt_data",      "user_id, defect_category"),
    ("idx_raw_rpt_user_qtr",          "raw_rpt_data",      "user_id, mfg_quarter"),
    # raw_gnovac_data
    ("idx_raw_gnovac_user_month",     "raw_gnovac_data",   "user_id, mfg_month"),
    ("idx_raw_gnovac_user_model",     "raw_gnovac_data",   "user_id, model_code"),
    ("idx_raw_gnovac_user_pointer",   "raw_gnovac_data",   "user_id, pointer"),
    ("idx_raw_gnovac_user_qtr",       "raw_gnovac_data",   "user_id, mfg_quarter"),
    # raw_rfi_data
    ("idx_raw_rfi_user_month",        "raw_rfi_data",      "user_id, mfg_month"),
    ("idx_raw_rfi_user_model",        "raw_rfi_data",      "user_id, model_name"),
    ("idx_raw_rfi_user_severity",     "raw_rfi_data",      "user_id, severity_name"),
    ("idx_raw_rfi_user_qtr",          "raw_rfi_data",      "user_id, mfg_quarter"),
    # raw_esqa_data
    ("idx_raw_esqa_user_month",       "raw_esqa_data",     "user_id, mfg_month"),
    ("idx_raw_esqa_user_model",       "raw_esqa_data",     "user_id, vehicle_model"),
    ("idx_raw_esqa_user_category",    "raw_esqa_data",     "user_id, concern_category"),
    ("idx_raw_esqa_user_qtr",         "raw_esqa_data",     "user_id, mfg_quarter"),
]


# Add new columns to existing tables (idempotent via IF NOT EXISTS)
COLUMN_MIGRATIONS = [
    "ALTER TABLE layouts ADD COLUMN IF NOT EXISTS legend_position_x FLOAT",
    "ALTER TABLE layouts ADD COLUMN IF NOT EXISTS legend_position_y FLOAT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'",
    "ALTER TABLE box_connections ADD COLUMN IF NOT EXISTS from_station_id VARCHAR(50)",
    "ALTER TABLE box_connections ADD COLUMN IF NOT EXISTS to_station_id VARCHAR(50)",
    # station_documents table (created idempotently)
    """
    CREATE TABLE IF NOT EXISTS station_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        layout_id INTEGER REFERENCES layouts(id) ON DELETE SET NULL,
        station_id VARCHAR(100) NOT NULL,
        concern_id VARCHAR(255),
        doc_type VARCHAR(50) NOT NULL,
        filename VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000),
        file_size INTEGER,
        mime_type VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_station_docs_station_id ON station_documents (station_id)",
    "CREATE INDEX IF NOT EXISTS idx_station_docs_layout_id ON station_documents (layout_id)",
    "CREATE INDEX IF NOT EXISTS idx_station_docs_concern_id ON station_documents (concern_id)",
    # buyoff icon label
    "ALTER TABLE buyoff_icons ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT ''",
    # canvas text labels stored as JSON array in the layout row
    "ALTER TABLE layouts ADD COLUMN IF NOT EXISTS text_labels TEXT DEFAULT '[]'",
    # canvas arrow elements stored as JSON array in the layout row
    "ALTER TABLE layouts ADD COLUMN IF NOT EXISTS canvas_arrows TEXT DEFAULT '[]'",
]


def run_column_migrations(session_factory) -> None:
    """
    Add new columns to existing tables using ALTER TABLE … ADD COLUMN IF NOT EXISTS.
    Safe to run on every startup — no-op if columns already exist.
    """
    applied = 0
    failed = 0
    for sql in COLUMN_MIGRATIONS:
        try:
            with session_factory() as session:
                session.execute(text(sql))
                session.commit()
            applied += 1
        except Exception as e:
            logger.warning(f"Column migration skipped [{sql[:60]}]: {e}")
            failed += 1
    logger.info(f"Column migrations complete: {applied} applied, {failed} skipped/failed")


def run_index_migrations(session_factory) -> None:
    """
    Create all missing indexes using CREATE INDEX IF NOT EXISTS.
    Each index is created in a separate transaction so one failure
    doesn't block the rest.
    """
    created = 0
    skipped = 0
    failed = 0
    for idx_name, table, cols in PART_LABELER_INDEXES:
        sql = f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({cols})"
        try:
            with session_factory() as session:
                session.execute(text(sql))
                session.commit()
            created += 1
        except Exception as e:
            logger.warning(f"Index migration skipped [{idx_name}]: {e}")
            failed += 1
    logger.info(
        f"Index migrations complete: {created} applied, {failed} skipped/failed"
    )
