"""
Chat History Manager
Manages conversation history in PostgreSQL database
"""

import logging
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from app.connectors.state_db_connector import StateDBConnector
from app.queries import ChatQueries

logger = logging.getLogger(__name__)


class ChatManager:
    """
    Manages chat history and conversation state in PostgreSQL
    """

    def __init__(self, state_db: StateDBConnector = None):
        """
        Initialize Chat Manager

        Args:
            state_db: Optional StateDB connector
        """
        self.db = state_db or StateDBConnector()

    def create_conversation(
        self, user_id: int, chat_title: str = "New Chat", agent_type: str = "analyst"
    ) -> int:
        """
        Create a new conversation

        Args:
            user_id: User identifier
            chat_title: Initial chat title
            agent_type: Type of agent for this conversation

        Returns:
            conversation_id
        """
        try:
            params = {
                "user_id": user_id,
                "chat_title": chat_title,
                "agent_type": agent_type,
                "creation_ts": datetime.now(timezone.utc),
                "is_deleted": False,
            }

            conversation_id = self.db.execute_insert(
                ChatQueries.CREATE_CONVERSATION, params
            )
            logger.info(f"Created conversation {conversation_id} for user {user_id}")
            return conversation_id

        except Exception as e:
            logger.error(f"Error creating conversation: {e}")
            raise

    def save_message(
        self,
        conversation_id: int,
        query: str,
        response: Dict[str, Any],
        clarification_needed: bool = False,
    ) -> int:
        """
        Save a message to conversation history

        Args:
            conversation_id: Conversation identifier
            query: User query
            response: Agent response (dict with response and similar_docs)
            clarification_needed: Whether clarification is needed

        Returns:
            message_id
        """
        try:
            params = {
                "conversation_id": conversation_id,
                "query": query,
                "response": json.dumps(response),
                "clarification_needed": clarification_needed,
                "chat_entry_ts": datetime.now(timezone.utc),
            }

            message_id = self.db.execute_insert(ChatQueries.SAVE_MESSAGE, params)
            logger.info(f"Saved message {message_id} to conversation {conversation_id}")
            return message_id

        except Exception as e:
            logger.error(f"Error saving message: {e}")
            raise

    def get_conversation_messages(self, conversation_id: int) -> List[Dict]:
        """
        Get all messages for a conversation

        Args:
            conversation_id: Conversation identifier

        Returns:
            List of message dictionaries
        """
        try:
            results = self.db.execute_query(
                ChatQueries.GET_CONVERSATION_MESSAGES,
                {"conversation_id": conversation_id},
            )

            messages = []
            for row in results:
                messages.append(
                    {
                        "message_id": row[0],
                        "query": row[1],
                        "response": (
                            json.loads(row[2]) if isinstance(row[2], str) else row[2]
                        ),
                        "chat_entry_ts": row[3].isoformat() if row[3] else None,
                        "clarification_needed": row[4],
                    }
                )

            logger.info(
                f"Retrieved {len(messages)} messages for conversation {conversation_id}"
            )
            return messages

        except Exception as e:
            logger.error(f"Error retrieving messages: {e}")
            return []

    def get_complete_chat(self, conversation_id: int) -> Dict:
        """
        Get complete chat with metadata and messages

        Args:
            conversation_id: Conversation identifier

        Returns:
            Complete chat dictionary
        """
        try:
            # Get conversation metadata
            conv_result = self.db.execute_query(
                ChatQueries.GET_CONVERSATION_METADATA,
                {"conversation_id": conversation_id},
            )

            if not conv_result:
                return {}

            conv_row = conv_result[0]
            messages = self.get_conversation_messages(conversation_id)

            return {
                "conversation_id": conversation_id,
                "user_id": conv_row[0],
                "chat_title": conv_row[1],
                "chat_summary": conv_row[2],
                "creation_ts": conv_row[3].isoformat() if conv_row[3] else None,
                "agent_type": conv_row[4],
                "query_responses": messages,
            }

        except Exception as e:
            logger.error(f"Error retrieving complete chat: {e}")
            return {}

    def list_user_chats(self, user_id: int, agent_type: str = None) -> List[Dict]:
        """
        List all chats for a user

        Args:
            user_id: User identifier
            agent_type: Optional filter by agent type

        Returns:
            List of chat summaries
        """
        try:
            if agent_type:
                query = ChatQueries.LIST_USER_CHATS_BY_AGENT
                params = {"user_id": user_id, "agent_type": agent_type}
            else:
                query = ChatQueries.LIST_USER_CHATS
                params = {"user_id": user_id}

            results = self.db.execute_query(query, params)

            chats = []
            for row in results:
                chats.append(
                    {
                        "conversation_id": row[0],
                        "chat_title": row[1],
                        "creation_ts": row[2].isoformat() if row[2] else None,
                        "agent_type": row[3],
                    }
                )

            logger.info(f"Retrieved {len(chats)} chats for user {user_id}")
            return chats

        except Exception as e:
            logger.error(f"Error listing chats: {e}")
            return []

    def update_chat_title(self, conversation_id: int, title: str) -> bool:
        """
        Update chat title

        Args:
            conversation_id: Conversation identifier
            title: New title

        Returns:
            True if successful
        """
        try:
            rows = self.db.execute_update(
                ChatQueries.UPDATE_CHAT_TITLE,
                {"title": title, "conversation_id": conversation_id},
            )

            return rows > 0

        except Exception as e:
            logger.error(f"Error updating chat title: {e}")
            return False

    def delete_chat(self, conversation_id: int) -> bool:
        """
        Soft delete a chat

        Args:
            conversation_id: Conversation identifier

        Returns:
            True if successful
        """
        try:
            rows = self.db.execute_update(
                ChatQueries.SOFT_DELETE_CHAT, {"conversation_id": conversation_id}
            )
            logger.info(f"Soft deleted conversation {conversation_id}")
            return rows > 0

        except Exception as e:
            logger.error(f"Error deleting chat: {e}")
            return False
