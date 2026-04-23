"""
FastAPI dependency that provides a StateDBConnector instance.
The connector is created once (singleton) and reused across requests.
"""

import logging
from app.connectors.state_db_connector import StateDBConnector

logger = logging.getLogger(__name__)

_connector: StateDBConnector = None


def get_connector() -> StateDBConnector:
    """
    Return the shared StateDBConnector.
    Initialises on first call; subsequent calls return the cached instance.
    """
    global _connector
    if _connector is None:
        logger.info("Initialising StateDBConnector …")
        _connector = StateDBConnector()
    return _connector