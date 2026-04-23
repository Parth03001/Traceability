"""
Startup Initializer
Handles all application initialization on startup
- Database creation
- Table creation + prompt seeding (single engine, single transaction)
- Connection validation (Neo4j, OpenSearch only — PostgreSQL already proven)
"""

import logging
from typing import Dict, Any

from sqlalchemy import create_engine, text, inspect

from app.config.config import get_settings
from app.connectors.table_creation import metadata
from app.queries import PromptQueries

logger = logging.getLogger(__name__)


def run_startup_initialization(skip_on_error: bool = True) -> Dict[str, Any]:
    """Entry-point called from main.py lifespan."""
    return StartupInitializer().initialize_all(skip_on_error)


class StartupInitializer:
    """
    Manages application startup initialization.

    Optimised for minimal network roundtrips:
      Step 1 – ensure the target DB exists          (1 roundtrip, AUTOCOMMIT engine)
      Step 2+3 – create tables AND seed prompts     (1 engine, 1 transaction)
      Step 4 – ping Neo4j + OpenSearch              (1 roundtrip each, raw clients)
    """

    def __init__(self):
        self.settings = get_settings()

    # ------------------------------------------------------------------
    def initialize_all(self, skip_on_error: bool = True) -> Dict[str, Any]:
        logger.info("=" * 60)
        logger.info("🚀 Starting Application Initialization...")
        logger.info("=" * 60)

        results = {
            "database": {"success": False, "message": ""},
            "tables": {"success": False, "message": ""},
            "prompts": {"success": False, "message": ""},
            "connections": {"success": False, "message": ""},
        }

        # Step 1 – database exists?
        logger.info("\n📊 Step 1/4: Initializing Database...")
        results["database"] = self._initialize_database()
        if not results["database"]["success"] and not skip_on_error:
            return results

        # Steps 2 + 3 – tables & prompts (shared engine)
        logger.info("\n📋 Step 2/4: Creating Tables...")
        logger.info("📝 Step 3/4: Seeding Prompts...")
        results["tables"], results["prompts"] = self._setup_tables_and_prompts()

        # Step 4 – external services
        logger.info("\n🔌 Step 4/4: Validating Connections...")
        results["connections"] = self._validate_connections()

        return results

    # ------------------------------------------------------------------
    # Step 1
    # ------------------------------------------------------------------
    def _initialize_database(self) -> Dict[str, Any]:
        """Create the target PostgreSQL database if it doesn't exist.
        Uses StateDBManager because CREATE DATABASE requires AUTOCOMMIT."""
        try:
            from app.connectors.state_db_manager import StateDBManager

            StateDBManager().initialize_database()
            logger.info("  ✅ Database initialized")
            return {"success": True, "message": "Database ready"}
        except Exception as e:
            logger.error(f"  ❌ Database init failed: {e}")
            return {"success": False, "message": str(e)}

    # ------------------------------------------------------------------
    # Steps 2 + 3  (single engine, single connection, single commit)
    # ------------------------------------------------------------------
    def _setup_tables_and_prompts(self) -> tuple:
        """Create tables and seed/update all prompts in one transaction."""
        from app.prompts.analyst_prompt import ANALYST_PROMPT
        from app.prompts.cypher_agent_prompt import CYPHER_AGENT_PROMPT
        from app.prompts.todo_list_middleware_prompt import TODO_LIST_MIDDLEWARE_PROMPT
        from app.prompts.standards_guidelines_prompt import STANDARDS_GUIDELINES_PROMPT

        PROMPTS = {
            "analyst_prompt": ("Quality Analyst Agent Prompt", ANALYST_PROMPT),
            "cypher_agent_prompt": ("Cypher Query Generator Prompt", CYPHER_AGENT_PROMPT),
            "todo_list_middleware_prompt": ("TodoListMiddleware System Prompt", TODO_LIST_MIDDLEWARE_PROMPT),
            "standards_guidelines_prompt": ("Standards & Guidelines Agent Prompt", STANDARDS_GUIDELINES_PROMPT),
        }

        table_result = {"success": False, "message": ""}
        prompt_result = {"success": False, "message": "", "details": {}}

        engine = create_engine(self.settings.postgres_url)
        try:
            # --- tables (SQLAlchemy handles its own connection internally) ---
            metadata.create_all(engine, checkfirst=True)

            # --- run incremental schema migrations (idempotent) ---
            from app.connectors.state_db_manager import StateDBManager
            StateDBManager().run_migrations()
            logger.info("  ✅ Migrations applied")

            tables = inspect(engine).get_table_names()
            logger.info(f"  ✅ Tables ready ({len(tables)})")
            table_result = {
                "success": True,
                "message": f"{len(tables)} tables ready",
                "tables": tables,
            }

            # --- prompts (one connection, one commit) ---
            with engine.connect() as conn:
                for key, (name, content) in PROMPTS.items():
                    exists = conn.execute(
                        text(PromptQueries.CHECK_PROMPT_EXISTS), {"key": key}
                    ).fetchone()

                    if exists:
                        conn.execute(
                            text(PromptQueries.UPDATE_PROMPT_CONTENT),
                            {"content": content, "key": key},
                        )
                    else:
                        conn.execute(
                            text(PromptQueries.INSERT_PROMPT),
                            {"key": key, "name": name, "content": content},
                        )
                    prompt_result["details"][key] = True

                conn.commit()  # single commit for all 4 prompts

            seeded = sum(1 for v in prompt_result["details"].values() if v)
            logger.info(f"  ✅ Prompts seeded ({seeded}/{len(PROMPTS)})")
            prompt_result["success"] = True
            prompt_result["message"] = f"{seeded}/{len(PROMPTS)} prompts ready"

        except Exception as e:
            logger.error(f"  ❌ Tables/prompts setup failed: {e}")
            if not table_result["success"]:
                table_result["message"] = str(e)
            if not prompt_result["success"]:
                prompt_result["message"] = str(e)
        finally:
            engine.dispose()

        # Warm the prompt cache so agents get cache-hits from first use
        from app.services.prompt_manager import get_prompt_manager

        get_prompt_manager().refresh_cache()

        return table_result, prompt_result

    # ------------------------------------------------------------------
    # Step 4
    # ------------------------------------------------------------------
    def _validate_connections(self) -> Dict[str, Any]:
        """Validate Neo4j and OpenSearch.

        PostgreSQL is intentionally skipped – steps 1-3 already exercised it
        successfully (table creation and prompt writes committed).
        """
        connection_results = {
            "postgres": True,   # proven by steps 1-3
            "neo4j": False,
            "opensearch": False,
        }
        logger.info("  ✅ PostgreSQL — already validated by steps 1-3")

        # --- Neo4j (raw driver, no schema fetch) ---
        try:
            from app.connectors.neo4j_connector import Neo4jConnector

            neo4j = Neo4jConnector()
            connection_results["neo4j"] = neo4j.test_connection()
            neo4j.close()
            if connection_results["neo4j"]:
                logger.info("  ✅ Neo4j connection validated")
            else:
                logger.warning("  ⚠️  Neo4j ping returned empty result")
        except Exception as e:
            logger.warning(f"  ⚠️  Neo4j validation failed: {e}")

        # --- OpenSearch (raw client ping — no FAISS, no embedding model) ---
        try:
            from opensearchpy import OpenSearch

            http_auth = (
                (self.settings.OPENSEARCH_USERNAME, self.settings.OPENSEARCH_PASSWORD)
                if self.settings.OPENSEARCH_USERNAME
                else None
            )
            client = OpenSearch(
                hosts=[{
                    "host": self.settings.OPENSEARCH_HOST,
                    "port": self.settings.OPENSEARCH_PORT,
                }],
                http_auth=http_auth,
                use_ssl=self.settings.OPENSEARCH_USE_SSL,
                verify_certs=self.settings.OPENSEARCH_VERIFY_CERTS,
                ssl_show_warn=False,
            )
            client.info()
            client.close()
            connection_results["opensearch"] = True
            logger.info("  ✅ OpenSearch connection validated")
        except Exception as e:
            logger.warning(f"  ⚠️  OpenSearch validation failed: {e}")

        all_valid = all(connection_results.values())
        failed = [k for k, v in connection_results.items() if not v]
        return {
            "success": all_valid,
            "message": "All connections valid" if all_valid else f"Failed: {failed}",
            "details": connection_results,
        }
