"""
State Database Manager
Handles database and table creation for PostgreSQL
"""

import logging
from sqlalchemy import create_engine, inspect, text
from app.config.config import get_settings
from app.connectors.table_creation import metadata
from app.queries import DatabaseQueries, QueryValidator

logger = logging.getLogger(__name__)


class StateDBManager:
    """
    Manages database initialization and table creation for PostgreSQL
    """

    def __init__(self):
        """Initialize with settings"""
        self.settings = get_settings()
        self.engine = None

    def _get_engine(self, database: str = None):
        """Get SQLAlchemy engine for specific database with UTF-8 encoding"""
        if database:
            url = f"postgresql://{self.settings.POSTGRES_USER}:{self.settings.POSTGRES_PASSWORD}@{self.settings.POSTGRES_HOST}:{self.settings.POSTGRES_PORT}/{database}?client_encoding=utf8"
        else:
            url = f"postgresql://{self.settings.POSTGRES_USER}:{self.settings.POSTGRES_PASSWORD}@{self.settings.POSTGRES_HOST}:{self.settings.POSTGRES_PORT}/postgres?client_encoding=utf8"

        return create_engine(url, isolation_level="AUTOCOMMIT")

    def initialize_database(self):
        """
        Create database if it doesn't exist.
        Note: Database names cannot be parameterized in PostgreSQL,
        so we use QueryValidator to ensure safety.
        """
        try:
            # Validate database name to prevent SQL injection
            db_name = self.settings.POSTGRES_DB
            QueryValidator.validate_identifier(db_name, "database name")

            # Connect to default postgres database
            engine = self._get_engine()

            with engine.connect() as conn:
                # Check if database exists using parameterized query
                result = conn.execute(
                    text(DatabaseQueries.CHECK_DATABASE_EXISTS), {"db_name": db_name}
                )
                exists = result.fetchone()

                if not exists:
                    logger.info(f"Creating database: {db_name}")
                    # Use validated query generator for CREATE DATABASE
                    create_query = DatabaseQueries.get_create_database_query(db_name)
                    conn.execute(text(create_query))
                    logger.info(f"Database '{db_name}' created successfully")
                else:
                    logger.info(f"Database '{db_name}' already exists")

            engine.dispose()

        except ValueError as e:
            logger.error(f"Invalid database name: {e}")
            raise
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise

    def create_tables_if_not_exists(self):
        """
        Create all tables defined in table_creation.py if they don't exist
        """
        try:
            # Connect to target database
            self.engine = self._get_engine(self.settings.POSTGRES_DB)

            # Get existing tables
            inspector = inspect(self.engine)
            existing_tables = inspector.get_table_names()

            logger.info(f"Existing tables: {existing_tables}")

            # Create all tables from metadata
            logger.info("Creating tables if not exists...")
            metadata.create_all(self.engine, checkfirst=True)

            # Get new list of tables
            inspector = inspect(self.engine)
            new_tables = inspector.get_table_names()

            created_tables = set(new_tables) - set(existing_tables)

            if created_tables:
                logger.info(f"Created new tables: {created_tables}")
            else:
                logger.info("All tables already exist")

            logger.info(f"Total tables in database: {len(new_tables)}")
            logger.info("Table creation completed successfully")

            self.engine.dispose()

        except Exception as e:
            logger.error(f"Error creating tables: {e}")
            raise

    def run_migrations(self):
        """
        Apply incremental schema migrations (idempotent).
        Run after create_tables_if_not_exists.
        """
        try:
            # Use a regular (non-AUTOCOMMIT) engine so we can commit explicitly.
            # _get_engine() uses AUTOCOMMIT which does not allow conn.commit().
            settings = self.settings
            url = (
                f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
                f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}"
                f"/{settings.POSTGRES_DB}?client_encoding=utf8"
            )
            from sqlalchemy import create_engine as _ce
            engine = _ce(url)
            with engine.connect() as conn:
                # ── Migrate bypass_icons → buyoff_icons ─────────────────────
                # create_all() may have already created an empty buyoff_icons,
                # so we copy any existing data then drop the old table.
                conn.execute(text("""
                    DO $$ BEGIN
                        IF EXISTS (
                            SELECT FROM pg_tables
                            WHERE schemaname = 'public' AND tablename = 'bypass_icons'
                        ) THEN
                            IF EXISTS (
                                SELECT FROM pg_tables
                                WHERE schemaname = 'public' AND tablename = 'buyoff_icons'
                            ) THEN
                                -- Both tables exist: copy old data (preserve IDs) then drop old
                                INSERT INTO buyoff_icons
                                    (id, layout_id, position_x, position_y, created_at)
                                OVERRIDING SYSTEM VALUE
                                SELECT id, layout_id, position_x, position_y, created_at
                                FROM bypass_icons
                                ON CONFLICT (id) DO NOTHING;
                                DROP TABLE bypass_icons CASCADE;
                            ELSE
                                -- Only old table exists: simple rename
                                ALTER TABLE bypass_icons RENAME TO buyoff_icons;
                            END IF;
                        END IF;
                    END $$;
                """))

                # ── Rename FK columns in box_connections ────────────────────
                conn.execute(text("""
                    DO $$ BEGIN
                        IF EXISTS (
                            SELECT FROM information_schema.columns
                            WHERE table_name = 'box_connections'
                              AND column_name = 'from_bypass_id'
                        ) THEN
                            ALTER TABLE box_connections
                                RENAME COLUMN from_bypass_id TO from_buyoff_id;
                        END IF;
                    END $$;
                """))
                conn.execute(text("""
                    DO $$ BEGIN
                        IF EXISTS (
                            SELECT FROM information_schema.columns
                            WHERE table_name = 'box_connections'
                              AND column_name = 'to_bypass_id'
                        ) THEN
                            ALTER TABLE box_connections
                                RENAME COLUMN to_bypass_id TO to_buyoff_id;
                        END IF;
                    END $$;
                """))

                # ── Add user_id to layouts ───────────────────────────────────
                conn.execute(text(
                    "ALTER TABLE layouts "
                    "ADD COLUMN IF NOT EXISTS user_id INTEGER;"
                ))

                # ── Add user_id and layout_id to input_records ───────────────
                conn.execute(text(
                    "ALTER TABLE input_records "
                    "ADD COLUMN IF NOT EXISTS user_id INTEGER;"
                ))
                conn.execute(text(
                    "ALTER TABLE input_records "
                    "ADD COLUMN IF NOT EXISTS layout_id INTEGER "
                    "REFERENCES layouts(id) ON DELETE SET NULL;"
                ))

                conn.commit()

            engine.dispose()
            logger.info("Migrations completed successfully")
        except Exception as e:
            logger.error(f"Error running migrations: {e}")
            raise

    def drop_all_tables(self):
        """
        Drop all tables (USE WITH CAUTION)
        """
        try:
            logger.warning("⚠️  Dropping all tables...")
            self.engine = self._get_engine(self.settings.POSTGRES_DB)
            metadata.drop_all(self.engine)
            logger.warning("All tables dropped")
            self.engine.dispose()
        except Exception as e:
            logger.error(f"Error dropping tables: {e}")
            raise

    def list_tables(self):
        """
        List all tables in the database
        """
        try:
            self.engine = self._get_engine(self.settings.POSTGRES_DB)
            inspector = inspect(self.engine)
            tables = inspector.get_table_names()

            logger.info(f"Tables in database '{self.settings.POSTGRES_DB}':")
            for table in tables:
                logger.info(f"  - {table}")

            self.engine.dispose()
            return tables

        except Exception as e:
            logger.error(f"Error listing tables: {e}")
            raise
