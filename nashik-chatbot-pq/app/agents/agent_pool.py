"""
Agent Pool
Manages agent lifecycle and provides agent instances
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from app.agents.checkpointer_manager import get_checkpointer_manager

logger = logging.getLogger(__name__)


class AgentPool:
    """
    Manages pool of agents for different conversation types.
    Provides context manager for agent lifecycle.

    All agent classes and Neo4jConnector are imported lazily (inside methods)
    so that the heavy langchain / langgraph packages are not loaded until
    the first actual request.  This keeps reload time near-zero.
    """

    def __init__(self, neo4j_connector=None):
        """
        Initialize Agent Pool

        Args:
            neo4j_connector: Optional shared Neo4j connector
        """
        if neo4j_connector is None:
            from app.connectors.neo4j_connector import Neo4jConnector

            neo4j_connector = Neo4jConnector()
        self.neo4j = neo4j_connector
        self._active_agents = {}

        # Initialize checkpointer manager for conversation memory
        self.checkpointer_manager = get_checkpointer_manager()
        self.checkpointer = self.checkpointer_manager.get_checkpointer()

        if self.checkpointer:
            logger.info("🧠 Agent pool initialized with PostgreSQL conversation memory")
        else:
            logger.warning(
                "⚠️  Agent pool initialized without persistent memory. "
                "Conversations will not persist across sessions."
            )

    @contextmanager
    def get_agent(self, conversation_id: int, agent_type: str = "analyst", **kwargs):
        """
        Get an agent instance with context management

        Args:
            conversation_id: Unique conversation identifier
            agent_type: Type of agent ('cypher' or 'analyst')
            **kwargs: Additional arguments for agent initialization

        Yields:
            Agent instance
        """
        agent_key = f"{conversation_id}_{agent_type}"

        try:
            # Lazy imports — heavy langchain/langgraph packages only load here
            if agent_type == "cypher":
                from app.agents.cypher_agent import CypherAgent

                agent = CypherAgent(neo4j_connector=self.neo4j)
            elif agent_type == "analyst":
                from app.agents.analyst_agent import AnalystAgent

                thread_id = f"conv_{conversation_id}"
                agent = AnalystAgent(
                    neo4j_connector=self.neo4j,
                    thread_id=thread_id,
                    checkpointer=self.checkpointer,
                )
            elif agent_type == "standards_guidelines":
                from app.agents.standards_guidelines_agent import StandardsGuidelinesAgent

                thread_id = f"conv_{conversation_id}"
                agent = StandardsGuidelinesAgent(
                    thread_id=thread_id,
                    checkpointer=self.checkpointer,
                )
            elif agent_type == "part_labeler_dashboard":
                from app.agents.part_labeler_dashboard_agent import PartLabelerDashboardAgent

                thread_id = f"conv_{conversation_id}"
                agent = PartLabelerDashboardAgent(
                    thread_id=thread_id,
                    checkpointer=self.checkpointer,
                )
            else:
                raise ValueError(f"Unknown agent type: {agent_type}")

            self._active_agents[agent_key] = agent
            emoji = "🔍" if agent_type == "cypher" else "📝"
            logger.info(
                f"{emoji} Created {agent_type.upper()} agent for conversation {conversation_id}"
            )

            yield agent

        finally:
            # Cleanup
            if agent_key in self._active_agents:
                del self._active_agents[agent_key]
                logger.info(
                    f"Released {agent_type} agent for conversation {conversation_id}"
                )

    def get_cypher_agent(self):
        """Get a standalone Cypher agent instance."""
        from app.agents.cypher_agent import CypherAgent

        return CypherAgent(neo4j_connector=self.neo4j)

    def get_analyst_agent(self, thread_id: str = "default"):
        """Get a standalone Analyst agent instance."""
        from app.agents.analyst_agent import AnalystAgent

        return AnalystAgent(
            neo4j_connector=self.neo4j,
            thread_id=thread_id,
            checkpointer=self.checkpointer,
        )

    def get_standards_guidelines_agent(self, thread_id: str = "default"):
        """Get a standalone Standards & Guidelines agent instance."""
        from app.agents.standards_guidelines_agent import StandardsGuidelinesAgent

        return StandardsGuidelinesAgent(
            thread_id=thread_id,
            checkpointer=self.checkpointer,
        )

    def get_active_agent_count(self) -> int:
        """
        Get number of currently active agents

        Returns:
            Count of active agents
        """
        return len(self._active_agents)

    def cleanup_all(self):
        """Cleanup all active agents"""
        logger.info(f"Cleaning up {len(self._active_agents)} active agents")
        self._active_agents.clear()

    def close(self):
        """
        Close agent pool and cleanup resources including checkpointer
        Call this during application shutdown
        """
        self.cleanup_all()
        if self.checkpointer_manager:
            self.checkpointer_manager.close()
            logger.info("Closed checkpointer manager")
