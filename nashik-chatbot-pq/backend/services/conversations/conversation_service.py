"""
Conversation Service
Orchestrates conversation flow, agent execution, and chat history
"""

import logging
import json
from typing import Dict, Any, Generator
from datetime import datetime
from app.chat_history.chat_manager import ChatManager
from app.connectors.state_db_connector import StateDBConnector

logger = logging.getLogger(__name__)


class ConversationService:
    """
    Service class for handling conversation flow and agent orchestration.

    Neo4jConnector and AgentPool are imported lazily in __init__ so that
    langchain_neo4j / langgraph are not pulled in at module load time.
    """

    def __init__(self):
        """Initialize the ConversationService"""
        from app.connectors.neo4j_connector import Neo4jConnector
        from app.agents.agent_pool import AgentPool

        self.neo4j = Neo4jConnector()
        self.state_db = StateDBConnector()
        self.chat_manager = ChatManager(self.state_db)
        self.agent_pool = AgentPool(self.neo4j)
        logger.info("ConversationService initialized")

    def start_new_chat(self, payload, agent_type: str = "analyst") -> int:
        """
        Start a new chat session and return the conversation ID

        Args:
            payload: Request payload containing user_id and page_context
            agent_type: Type of agent ('analyst' or 'cypher')

        Returns:
            conversation_id
        """
        try:
            user_id = payload.user_id
            chat_title = f"New Chat - {datetime.now().strftime('%Y-%m-%d %H:%M')}"

            conversation_id = self.chat_manager.create_conversation(
                user_id=user_id, chat_title=chat_title, agent_type=agent_type
            )

            logger.info(f"Started new {agent_type} chat: {conversation_id}")
            return conversation_id

        except Exception as e:
            logger.error(f"Error starting new chat: {e}")
            raise

    # Maximum number of automatic retries when the agent finishes tool calls
    # but emits zero response tokens (e.g. connection dropped mid-generation).
    _MAX_RETRIES = 1

    # Nudge sent to the agent on retry so it produces its final answer from
    # the tool-call results already stored in the checkpointer.
    _RETRY_NUDGE = (
        "Based on all the tool-call results and analysis you have already completed above, "
        "please now synthesise and provide your comprehensive final answer to the user's question. "
        "Do NOT call any more tools — write the answer directly."
    )

    def process_streaming(
        self, conversation_id: int, payload, agent_type: str = "analyst"
    ) -> Generator[str, None, None]:
        """
        Stream the processing of a query through the specified agent.

        Includes an automatic retry: if the agent completes all tool calls but
        emits zero response tokens (e.g. the connection was lost mid-generation),
        the service re-invokes the same agent thread with a nudge so it produces
        the final answer from its already-saved checkpointer state.

        Args:
            conversation_id: Unique identifier for the chat session
            payload: The request payload containing user message
            agent_type: Agent type to use

        Yields:
            JSON-formatted string events for streaming
        """
        try:
            if not payload.user_message:
                yield f"data: {json.dumps({'type': 'error', 'content': 'User message is required'})}\n\n"
                return

            full_response: list[str] = []
            chart_data = None
            citations_data: list = []

            with self.agent_pool.get_agent(conversation_id, agent_type) as agent:
                logger.info(
                    f"Using {agent_type} agent for conversation {conversation_id}"
                )

                original_question = payload.user_message

                for attempt in range(self._MAX_RETRIES + 1):
                    question = original_question if attempt == 0 else self._RETRY_NUDGE
                    token_count = 0
                    thinking_count = 0

                    if attempt > 0:
                        logger.warning(
                            f"[conv={conversation_id}] Retry #{attempt}: agent had "
                            f"{thinking_count_prev} thinking steps but 0 tokens. "
                            "Re-invoking with nudge."
                        )
                        yield (
                            f"data: {json.dumps({'type': 'progress', 'stage': 'retrying', 'attempt': attempt, 'detail': 'Agent did not generate a response — retrying…'})}\n\n"
                        )

                    for event in agent.stream(user_question=question):
                        yield f"data: {json.dumps(event)}\n\n"

                        etype = event.get("type")
                        if etype == "token":
                            full_response.append(event["content"])
                            token_count += 1
                        elif etype == "thinking":
                            thinking_count += 1
                        elif etype == "chart":
                            chart_data = event.get("chart_data")
                            logger.info(
                                f"Captured chart data: "
                                f"{chart_data.get('type') if chart_data else None}"
                            )
                        elif etype == "citations":
                            citations_data = event.get("citations", [])
                            logger.info(f"Captured {len(citations_data)} citations")

                    # Decide whether to retry
                    if token_count > 0:
                        break  # Got a response — done
                    if attempt >= self._MAX_RETRIES:
                        break  # No more retries allowed
                    if thinking_count == 0:
                        break  # Agent did nothing at all; retrying won't help

                    # Save thinking count for the warning message on next loop
                    thinking_count_prev = thinking_count

                # ── Persist and finalise ────────────────────────────────────
                if full_response:
                    complete_response = "".join(full_response)
                    response_data: dict = {
                        "response": complete_response,
                        "similar_docs": citations_data if citations_data else [],
                    }
                    if chart_data:
                        response_data["chart_data"] = chart_data

                    message_id = self.chat_manager.save_message(
                        conversation_id=conversation_id,
                        query=original_question,
                        response=response_data,
                        clarification_needed=False,
                    )

                    # Update chat title on first message
                    messages = self.chat_manager.get_conversation_messages(
                        conversation_id
                    )
                    if len(messages) == 1:
                        title = original_question[:50] + (
                            "..." if len(original_question) > 50 else ""
                        )
                        self.chat_manager.update_chat_title(conversation_id, title)

                    final_data: dict = {
                        "type": "final",
                        "content": complete_response,
                        "messageId": message_id,
                        "response": complete_response,
                        "citations": citations_data if citations_data else [],
                    }
                    if chart_data:
                        final_data["chart_data"] = chart_data

                    yield f"data: {json.dumps(final_data)}\n\n"
                    logger.info(
                        f"Saved message {message_id} to conversation {conversation_id}"
                    )

        except Exception as e:
            logger.error(f"Error in process_streaming: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': f'Error: {str(e)}'})}\n\n"

    def get_complete_chat(self, conversation_id: int) -> Dict:
        """
        Retrieve the complete chat history for a given chat session

        Args:
            conversation_id: The ID of the chat session

        Returns:
            Complete chat history dictionary
        """
        try:
            complete_chat = self.chat_manager.get_complete_chat(conversation_id)
            logger.debug(f"Retrieved complete chat for {conversation_id}")
            return complete_chat
        except Exception as e:
            logger.error(f"Error retrieving complete chat: {e}", exc_info=True)
            return {}

    def list_chats(self, user_id: int, agent_type: str = "analyst") -> list:
        """
        List all chat sessions for a given user, filtered by agent type

        Args:
            user_id: The ID of the user
            agent_type: Agent type filter ('analyst' or 'cypher')

        Returns:
            List of chat sessions with metadata
        """
        try:
            chats = self.chat_manager.list_user_chats(user_id, agent_type)
            logger.info(
                f"Listed {len(chats)} chats for user {user_id} (type: {agent_type})"
            )
            return chats
        except Exception as e:
            logger.error(f"Error listing chats: {e}", exc_info=True)
            return []

    def delete_chat(self, conversation_id: int) -> bool:
        """
        Delete a conversation (soft delete)

        Args:
            conversation_id: The ID of the conversation to delete

        Returns:
            True if deletion was successful
        """
        try:
            success = self.chat_manager.delete_chat(conversation_id)
            if success:
                logger.info(f"Successfully deleted conversation {conversation_id}")
            else:
                logger.warning(f"Failed to delete conversation {conversation_id}")
            return success
        except Exception as e:
            logger.error(f"Error deleting conversation: {e}", exc_info=True)
            return False

    def upsert_feedback(self, conversation_id: int, message_id: int, payload) -> str:
        """
        Create or update feedback for a specific chat entry
        (Placeholder for future feedback implementation)

        Args:
            conversation_id: The unique identifier for the conversation
            message_id: The unique identifier for the message
            payload: Feedback data

        Returns:
            Feedback ID
        """
        try:
            # TODO: Implement feedback storage
            logger.info(
                f"Feedback received for message {message_id} in conversation {conversation_id}"
            )
            return "feedback_placeholder"
        except Exception as e:
            logger.error(f"Error saving feedback: {e}")
            raise
