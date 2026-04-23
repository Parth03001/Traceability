"""
Prompt Manager Service
Manages system prompts stored in the database
Provides fallback to default prompts if database is unavailable
"""

import logging
from typing import Dict, Optional, Any
from functools import lru_cache
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.config.config import get_settings
from app.queries import PromptQueries

logger = logging.getLogger(__name__)


# Default prompts - used as fallback if database is unavailable
DEFAULT_PROMPTS = {
    "analyst_prompt": {
        "name": "Quality Analyst Agent Prompt",
        "content": None,  # Will be loaded from file
    },
    "cypher_agent_prompt": {
        "name": "Cypher Query Generator Prompt",
        "content": None,  # Will be loaded from file
    },
    "todo_list_middleware_prompt": {
        "name": "TodoListMiddleware System Prompt",
        "content": None,  # Will be loaded from file
    },
    "standards_guidelines_prompt": {
        "name": "Standards & Guidelines Agent Prompt",
        "content": None,  # Will be loaded from file
    },
    "part_labeler_dashboard_prompt": {
        "name": "Part Labeler Dashboard Agent Prompt",
        "content": None,  # Will be loaded from file
    },
}


def _load_default_prompts_from_files():
    """Load default prompt content from the prompt files"""
    try:
        from app.prompts.analyst_prompt import ANALYST_PROMPT
        from app.prompts.cypher_agent_prompt import CYPHER_AGENT_PROMPT
        from app.prompts.todo_list_middleware_prompt import TODO_LIST_MIDDLEWARE_PROMPT
        from app.prompts.standards_guidelines_prompt import STANDARDS_GUIDELINES_PROMPT

        DEFAULT_PROMPTS["analyst_prompt"]["content"] = ANALYST_PROMPT
        DEFAULT_PROMPTS["cypher_agent_prompt"]["content"] = CYPHER_AGENT_PROMPT
        DEFAULT_PROMPTS["todo_list_middleware_prompt"]["content"] = TODO_LIST_MIDDLEWARE_PROMPT
        DEFAULT_PROMPTS["standards_guidelines_prompt"]["content"] = STANDARDS_GUIDELINES_PROMPT
        from app.prompts.part_labeler_dashboard_prompt import PART_LABELER_DASHBOARD_PROMPT
        DEFAULT_PROMPTS["part_labeler_dashboard_prompt"]["content"] = PART_LABELER_DASHBOARD_PROMPT
        logger.debug("Default prompts loaded from files")
    except ImportError as e:
        logger.warning(f"Could not load default prompts from files: {e}")


# Load defaults on module import
_load_default_prompts_from_files()


class PromptManager:
    """
    Manages system prompts with database storage and fallback support

    Features:
    - Load prompts from PostgreSQL database
    - Fallback to default prompts if database unavailable
    - Cache prompts for performance
    - CRUD operations for prompts
    """

    _instance = None
    _cache: Dict[str, str] = {}
    _cache_loaded = False

    def __new__(cls):
        """Singleton pattern to ensure single instance"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize PromptManager"""
        if not hasattr(self, "_initialized"):
            self.settings = get_settings()
            self._initialized = True

    def _get_engine(self):
        """Get SQLAlchemy engine for database connection with UTF-8 encoding"""
        try:
            # Use postgres_url from settings which includes UTF-8 encoding
            return create_engine(self.settings.postgres_url)
        except Exception as e:
            logger.error(f"Error creating database engine: {e}")
            return None

    def get_prompt(self, prompt_key: str, use_cache: bool = True) -> Optional[str]:
        """
        Get a prompt by key from database with fallback to defaults

        Args:
            prompt_key: The unique key for the prompt (e.g., 'analyst_prompt')
            use_cache: Whether to use cached value if available

        Returns:
            Prompt content string or None if not found
        """
        # Check cache first
        if use_cache and prompt_key in self._cache:
            logger.debug(f"Returning cached prompt: {prompt_key}")
            return self._cache[prompt_key]

        # Try database
        try:
            engine = self._get_engine()
            if engine:
                with engine.connect() as conn:
                    result = conn.execute(
                        text(PromptQueries.GET_PROMPT_BY_KEY),
                        {"key": prompt_key},
                    )
                    row = result.fetchone()
                    if row:
                        prompt_content = row[0]
                        self._cache[prompt_key] = prompt_content
                        logger.info(f"Loaded prompt from database: {prompt_key}")
                        return prompt_content
                engine.dispose()
        except SQLAlchemyError as e:
            logger.warning(f"Database error loading prompt '{prompt_key}': {e}")
        except Exception as e:
            logger.warning(f"Error loading prompt '{prompt_key}': {e}")

        # Fallback to default
        if prompt_key in DEFAULT_PROMPTS and DEFAULT_PROMPTS[prompt_key]["content"]:
            logger.info(f"Using default prompt for: {prompt_key}")
            return DEFAULT_PROMPTS[prompt_key]["content"]

        logger.warning(f"Prompt not found: {prompt_key}")
        return None

    def get_all_prompts(self) -> Dict[str, Any]:
        """
        Get all prompts from database

        Returns:
            Dictionary of prompt data keyed by prompt_key
        """
        prompts = {}
        try:
            engine = self._get_engine()
            if engine:
                with engine.connect() as conn:
                    result = conn.execute(text(PromptQueries.GET_ALL_PROMPTS))
                    for row in result:
                        prompts[row[0]] = {
                            "name": row[1],
                            "content": row[2],
                            "updated_at": row[3],
                        }
                engine.dispose()
        except Exception as e:
            logger.error(f"Error loading all prompts: {e}")

        return prompts

    def upsert_prompt(
        self,
        prompt_key: str,
        prompt_name: str,
        prompt_content: str,
    ) -> bool:
        """
        Insert or update a prompt in the database

        Args:
            prompt_key: Unique key for the prompt
            prompt_name: Display name for the prompt
            prompt_content: The actual prompt content

        Returns:
            True if successful, False otherwise
        """
        try:
            engine = self._get_engine()
            if not engine:
                return False

            with engine.connect() as conn:
                # Check if prompt exists
                result = conn.execute(
                    text(PromptQueries.GET_PROMPT_ID_BY_KEY),
                    {"key": prompt_key},
                )
                existing = result.fetchone()

                if existing:
                    # Update existing prompt
                    conn.execute(
                        text(PromptQueries.UPDATE_PROMPT),
                        {
                            "name": prompt_name,
                            "content": prompt_content,
                            "key": prompt_key,
                        },
                    )
                    logger.info(f"Updated prompt: {prompt_key}")
                else:
                    # Insert new prompt
                    conn.execute(
                        text(PromptQueries.INSERT_PROMPT),
                        {
                            "key": prompt_key,
                            "name": prompt_name,
                            "content": prompt_content,
                        },
                    )
                    logger.info(f"Inserted new prompt: {prompt_key}")

                conn.commit()

            engine.dispose()

            # Clear cache for this prompt
            if prompt_key in self._cache:
                del self._cache[prompt_key]

            return True

        except Exception as e:
            logger.error(f"Error upserting prompt '{prompt_key}': {e}")
            return False

    def seed_default_prompts(self, force_update: bool = False) -> Dict[str, bool]:
        """
        Seed database with default prompts.
        Uses a single engine and single transaction for all prompts.

        Args:
            force_update: If True, update existing prompts with defaults

        Returns:
            Dictionary with prompt_key -> success status
        """
        results = {}
        engine = self._get_engine()
        if not engine:
            return {key: False for key in DEFAULT_PROMPTS}

        try:
            with engine.connect() as conn:
                for prompt_key, prompt_data in DEFAULT_PROMPTS.items():
                    if prompt_data["content"] is None:
                        logger.warning(f"Skipping prompt '{prompt_key}' - no content available")
                        results[prompt_key] = False
                        continue

                    exists = conn.execute(
                        text(PromptQueries.CHECK_PROMPT_EXISTS),
                        {"key": prompt_key},
                    ).fetchone() is not None

                    if not exists:
                        conn.execute(
                            text(PromptQueries.INSERT_PROMPT),
                            {"key": prompt_key, "name": prompt_data["name"], "content": prompt_data["content"]},
                        )
                        logger.info(f"Seeded prompt: {prompt_key}")
                        results[prompt_key] = True
                    elif force_update:
                        conn.execute(
                            text(PromptQueries.UPDATE_PROMPT_CONTENT),
                            {"content": prompt_data["content"], "key": prompt_key},
                        )
                        logger.info(f"Updated prompt: {prompt_key}")
                        results[prompt_key] = True
                    else:
                        logger.info(f"Prompt '{prompt_key}' already exists, skipping")
                        results[prompt_key] = True

                conn.commit()  # single commit for all prompts
        except Exception as e:
            logger.error(f"Error in seed_default_prompts: {e}")
        finally:
            engine.dispose()

        return results

    def clear_cache(self):
        """Clear the prompt cache"""
        self._cache.clear()
        logger.info("Prompt cache cleared")

    def refresh_cache(self):
        """Refresh cache by loading all prompts from database"""
        self.clear_cache()
        prompts = self.get_all_prompts()
        for key, data in prompts.items():
            self._cache[key] = data["content"]
        logger.info(f"Refreshed cache with {len(self._cache)} prompts")


# Singleton instance
_prompt_manager: Optional[PromptManager] = None


def get_prompt_manager() -> PromptManager:
    """Get the singleton PromptManager instance"""
    global _prompt_manager
    if _prompt_manager is None:
        _prompt_manager = PromptManager()
    return _prompt_manager


def get_analyst_prompt() -> str:
    """Get the analyst agent prompt"""
    manager = get_prompt_manager()
    prompt = manager.get_prompt("analyst_prompt")
    return prompt


def get_cypher_prompt() -> str:
    """Get the cypher agent prompt"""
    manager = get_prompt_manager()
    prompt = manager.get_prompt("cypher_agent_prompt")
    return prompt


def get_todo_list_middleware_prompt() -> str:
    """Get the TodoListMiddleware system prompt"""
    manager = get_prompt_manager()
    prompt = manager.get_prompt("todo_list_middleware_prompt")
    if not prompt:
        logger.warning("TodoListMiddleware prompt not found, using empty string")
        return ""
    return prompt


def get_standards_guidelines_prompt() -> str:
    """Get the Standards & Guidelines agent prompt"""
    manager = get_prompt_manager()
    prompt = manager.get_prompt("standards_guidelines_prompt")
    return prompt


def get_part_labeler_dashboard_prompt() -> str:
    """Get the Part Labeler Dashboard agent prompt"""
    manager = get_prompt_manager()
    prompt = manager.get_prompt("part_labeler_dashboard_prompt")
    return prompt
