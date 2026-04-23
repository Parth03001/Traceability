"""
Conversation API Routes
Handles HTTP and WebSocket endpoints for conversations
"""

import logging
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import (
    APIRouter,
    HTTPException,
    Path,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import JSONResponse
from backend.models.schemas.conversation_schemas import (
    ConversationDto,
    InitiateConversationDto,
    InitiateConversationResponseDto,
    FeedbackDto,
)

# Dedicated thread pool for streaming generators (non-daemon so clean shutdown)
_stream_executor = ThreadPoolExecutor(max_workers=20, thread_name_prefix="ws-stream")
logger = logging.getLogger(__name__)

router = APIRouter(tags=["conversations"])

# Lazy-loaded service instance (created on first use, after database initialization)
_conversation_service = None


def get_conversation_service():
    """
    Get the conversation service instance (lazy initialization).
    Import is deferred here so that langchain/langgraph are not loaded
    at module import time — keeps reload instant.
    """
    global _conversation_service
    if _conversation_service is None:
        from backend.services.conversations.conversation_service import ConversationService

        _conversation_service = ConversationService()
    return _conversation_service


@router.post("/initiate", response_model=InitiateConversationResponseDto)
async def initiate_conversation(payload: InitiateConversationDto):
    """
    Initiate a new conversation

    Args:
        payload: Request with user_id and agent_type

    Returns:
        Conversation ID and initial message
    """
    try:
        agent_type = payload.agent_type or "analyst"

        conversation_id = get_conversation_service().start_new_chat(payload, agent_type)

        result = {
            "conversationId": conversation_id,
            "initial_message": "Chat session started.",
        }

        return JSONResponse(content=result, status_code=200)

    except Exception as e:
        logger.error(f"Error initiating conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to initiate conversation")


@router.post("/{conversation_id}/messages/{message_id}/feedback")
async def submit_feedback(
    conversation_id: int = Path(..., description="Unique conversation identifier"),
    message_id: int = Path(..., description="Unique message identifier"),
    payload: FeedbackDto = None,
):
    """
    Submit feedback for a message

    Args:
        conversation_id: Conversation ID
        message_id: Message ID
        payload: Feedback data

    Returns:
        Feedback confirmation
    """
    try:
        feedback_id = get_conversation_service().upsert_feedback(
            conversation_id, message_id, payload
        )

        result = {
            "status": "SUCCESS",
            "data": {
                "feedbackId": feedback_id,
                "feedback": payload.feedback,
                "messageId": message_id,
            },
        }

        return JSONResponse(result)

    except Exception as e:
        logger.error(f"Error submitting feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to submit feedback")


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: int = Path(..., description="Unique conversation identifier"),
):
    """
    Get complete conversation history

    Args:
        conversation_id: Conversation ID

    Returns:
        Complete conversation with all messages
    """
    try:
        response = get_conversation_service().get_complete_chat(conversation_id)
        return JSONResponse({"response": response})

    except Exception as e:
        logger.error(f"Error retrieving conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve conversation")


@router.get("/user/{user_id}/history")
async def get_conversation_history(
    user_id: int = Path(..., description="Unique user identifier"),
    agent_type: str = Query("analyst", description="Agent type filter"),
):
    """
    Get conversation history for a user

    Args:
        user_id: User ID
        agent_type: Filter by agent type ('analyst' or 'cypher')

    Returns:
        List of user's conversations
    """
    try:
        response = get_conversation_service().list_chats(user_id, agent_type)
        return JSONResponse({"response": response})

    except Exception as e:
        logger.error(f"Error retrieving conversation history: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to retrieve conversation history"
        )


@router.websocket("/{conversation_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: int = Path(..., description="Unique conversation identifier"),
):
    """
    WebSocket endpoint for streaming conversation responses.

    Uses an asyncio Queue to decouple the synchronous streaming generator
    (which runs in a thread-pool executor) from the async WebSocket send loop.
    A keepalive ping is sent every KEEPALIVE_INTERVAL seconds so the connection
    never times out during long agent tool-call chains.

    Args:
        websocket: WebSocket connection
        conversation_id: Conversation ID
    """
    KEEPALIVE_INTERVAL = 15.0  # seconds between pings when no events arrive

    await websocket.accept()

    try:
        # Receive message
        data = await websocket.receive_text()

        try:
            payload_data = json.loads(data)
        except json.JSONDecodeError:
            await websocket.send_json(
                {"type": "error", "content": "Invalid message format"}
            )
            return

        agent_type = payload_data.get("agent_type", "analyst")

        # Validate agent type
        if agent_type not in [
            "analyst",
            "cypher",
            "standards_guidelines",
            "part_labeler_dashboard",
        ]:
            await websocket.send_json(
                {
                    "type": "error",
                    "content": (
                        f"Invalid agent type: {agent_type}. Must be one of: "
                        "'analyst', 'cypher', 'standards_guidelines', 'part_labeler_dashboard'."
                    ),
                }
            )
            return

        # Build payload
        payload = ConversationDto(
            user_id=payload_data.get("user_id", 1),
            user_message=payload_data.get("user_message"),
            agent_type=agent_type,
        )

        if not payload.user_message:
            await websocket.send_json(
                {"type": "error", "content": "User message is required"}
            )
            return

        # Send initialization message (filtered by frontend, kept for debugging)
        await websocket.send_json(
            {
                "type": "thinking",
                "step": "initialization",
                "content": f"Processing your query with {agent_type.upper()} agent...",
            }
        )

        # ------------------------------------------------------------------ #
        # Queue-based streaming with keepalive                                 #
        # The sync generator runs in a thread-pool executor so it never        #
        # blocks the event loop.  The event loop can send keepalive pings      #
        # whenever the queue is empty (agent is doing a long tool call).       #
        # ------------------------------------------------------------------ #
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def _run_streaming():
            """Run in executor thread; push every event onto the asyncio queue."""
            try:
                for event_str in get_conversation_service().process_streaming(
                    conversation_id, payload, agent_type
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, event_str)
            except Exception as exc:
                err_event = json.dumps({"type": "error", "content": str(exc)})
                loop.call_soon_threadsafe(
                    queue.put_nowait, f"data: {err_event}\n\n"
                )
            finally:
                # Sentinel: signals the consumer loop to stop
                loop.call_soon_threadsafe(queue.put_nowait, None)

        stream_future = loop.run_in_executor(_stream_executor, _run_streaming)

        # Consumer loop: forward events to WebSocket; ping when queue is idle
        while True:
            try:
                event_str = await asyncio.wait_for(
                    queue.get(), timeout=KEEPALIVE_INTERVAL
                )
            except asyncio.TimeoutError:
                # No event arrived in time — send a keepalive ping and wait again
                try:
                    await websocket.send_json({"type": "keepalive"})
                except Exception:
                    break  # Client disconnected
                continue

            if event_str is None:
                break  # Streaming completed

            if event_str.startswith("data: "):
                json_str = event_str[6:].strip()
                try:
                    await websocket.send_text(json_str)
                    await asyncio.sleep(0.01)  # Smooth streaming
                except Exception:
                    break  # Client disconnected mid-stream

        # Wait for the executor thread to finish (it should already be done)
        try:
            await asyncio.wait_for(asyncio.wrap_future(stream_future), timeout=5.0)
        except (asyncio.TimeoutError, Exception):
            pass

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for conversation {conversation_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
            await asyncio.sleep(0.1)
        except Exception:
            pass

    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.delete("/delete/{conversation_id}")
async def delete_conversation(
    conversation_id: int = Path(..., description="Unique conversation identifier"),
):
    """
    Soft delete a conversation

    Args:
        conversation_id: Conversation ID

    Returns:
        Deletion confirmation
    """
    try:
        success = get_conversation_service().delete_chat(conversation_id)

        if success:
            return JSONResponse(
                {
                    "message": "Conversation deleted successfully",
                    "conversation_id": conversation_id,
                }
            )
        else:
            raise HTTPException(status_code=404, detail="Conversation not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete conversation")
