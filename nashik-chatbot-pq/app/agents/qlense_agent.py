"""
QLense Quality Assistant Agent
Two-phase conversational agent:
  Phase 1 — discovers quality issues from PostgreSQL (part labeler tables)
  Phase 2 — retrieves solutions from OpenSearch vector knowledge base
"""

import logging
import sys
from typing import Dict, Any, Generator

logger = logging.getLogger(__name__)


class QLenseAgent:
    """
    Two-phase agent that:
      Phase 1: queries PostgreSQL (warranty, RPT, GNOVAC, RFI, e-SQA) to list
               quality issues for a given part/component.
      Phase 2: searches the OpenSearch vector DB for solutions/remediation
               guidance — only after the user explicitly asks.

    Tools:
      - get_part_labeler_schema : understand table/column definitions
      - execute_read_query      : read-only SQL for issue discovery
      - think                   : reasoning scratchpad (both phases)
      - search_standards        : vector DB solution retrieval (Phase 2 only)

    Middleware: TodoListMiddleware, SummarizationMiddleware
    Memory:    PostgreSQL-backed checkpointer (per thread_id)
    """

    def __init__(
        self,
        thread_id: str = "default",
        checkpointer=None,
        enable_summarization: bool = True,
        summarization_trigger_tokens: int = 100_000,
        keep_recent_messages: int = 20,
    ):
        from app.models.model_factory import ModelFactory

        self.llm = ModelFactory.get_analyst_model()
        self.thread_id = thread_id
        self.checkpointer = checkpointer
        self.enable_summarization = enable_summarization
        self.summarization_trigger_tokens = summarization_trigger_tokens
        self.keep_recent_messages = keep_recent_messages
        self.agent = None
        self._initialize_agent()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _initialize_agent(self):
        """Build the LangChain agent with QLense tools."""
        try:
            from app.tools.pg_schema_tool import get_part_labeler_schema
            from app.tools.pg_query_tool import execute_read_query
            from app.tools.vector_db_tool import search_standards
            from app.tools.think_tool import think
            from app.services.prompt_manager import (
                get_qlense_prompt,
                get_todo_list_middleware_prompt,
            )
            from langchain.agents import create_agent
            from langchain.agents.middleware import (
                SummarizationMiddleware,
                TodoListMiddleware,
            )

            prompt = get_qlense_prompt()

            agent_kwargs = {
                "model": self.llm,
                "tools": [get_part_labeler_schema, execute_read_query, search_standards, think],
                "system_prompt": prompt,
                "name": "qlense_agent",
            }

            if self.checkpointer is not None:
                agent_kwargs["checkpointer"] = self.checkpointer
                logger.info(
                    f"✅ QLense agent initialised with PostgreSQL memory "
                    f"(thread_id: {self.thread_id})"
                )
            else:
                logger.warning(
                    "⚠️  QLense agent initialised without persistent memory."
                )

            middleware = []

            todo_prompt = get_todo_list_middleware_prompt()
            middleware.append(TodoListMiddleware(system_prompt=todo_prompt))
            logger.info("✅ TodoListMiddleware enabled for QLense agent")

            if self.enable_summarization:
                from app.models.model_factory import ModelFactory

                summarization_model = ModelFactory.get_default_chat_model()
                middleware.append(
                    SummarizationMiddleware(
                        model=summarization_model,
                        trigger=("tokens", self.summarization_trigger_tokens),
                        keep=("messages", self.keep_recent_messages),
                        trim_tokens_to_summarize=4000,
                    )
                )
                logger.info(
                    f"🔄 Summarisation enabled: triggers at "
                    f"{self.summarization_trigger_tokens} tokens, "
                    f"keeps {self.keep_recent_messages} recent messages"
                )

            if middleware:
                agent_kwargs["middleware"] = middleware

            self.agent = create_agent(**agent_kwargs)
            logger.info("QLense agent initialised successfully")

        except Exception as e:
            logger.error(f"Error initialising QLense agent: {e}")
            raise

    # ------------------------------------------------------------------
    # Streaming
    # ------------------------------------------------------------------

    def stream(self, user_question: str) -> Generator[Dict[str, Any], None, None]:
        """
        Stream responses in real-time.

        Yields the same event types as other agents (frontend compatible):
            {"type": "thinking",  "step": str,     "content": str}
            {"type": "token",     "content": str,  "metadata": {...}}
            {"type": "progress",  "stage": str,    "step_count": int}
            {"type": "citations", "citations": list}   ← Phase 2 only
            {"type": "error",     "content": str}
        """
        try:
            logger.info(f"Streaming QLense for: {user_question[:100]}…")

            inputs = {"messages": [{"role": "user", "content": user_question}]}
            config = {"configurable": {"thread_id": self.thread_id}}

            RESPONSE_NODES = {"qlense_agent", "assistant", "model", "__end__"}
            THINKING_NODES = {"tools", "agent:edges"}
            FILTERED_NODES = {"tools:edges"}

            just_finished_thinking = False
            response_started = False
            thinking_step_count = 0
            citations = []

            for stream_mode, chunk in self.agent.stream(
                inputs, config, stream_mode=["custom", "messages", "updates"]
            ):
                # ── custom stream ────────────────────────────────────────────
                if stream_mode == "custom":
                    if isinstance(chunk, dict) and "thinking" in chunk:
                        node_name = chunk.get("node", "unknown")
                        if node_name in FILTERED_NODES:
                            continue
                        just_finished_thinking = True
                        thinking_step_count += 1
                        yield {
                            "type": "thinking",
                            "step": "Processing",
                            "content": chunk.get("thinking", ""),
                        }

                # ── updates stream (tool calls / results) ────────────────────
                elif stream_mode == "updates":
                    try:
                        if not isinstance(chunk, dict):
                            continue

                        for node_name, node_data in chunk.items():
                            if (
                                not isinstance(node_data, dict)
                                or "messages" not in node_data
                            ):
                                continue

                            messages = node_data["messages"]
                            if not messages:
                                continue
                            last_msg = messages[-1]

                            # AIMessage with tool_calls (before execution)
                            if (
                                hasattr(last_msg, "tool_calls")
                                and last_msg.tool_calls
                            ):
                                for tool_call in last_msg.tool_calls:
                                    tool_name = tool_call.get("name", "")
                                    logger.info(f"🔧 Tool call: '{tool_name}'")

                                    if tool_name == "think":
                                        args = tool_call.get("args", {})
                                        thought = (
                                            args.get("thought", "")
                                            if isinstance(args, dict)
                                            else str(args)
                                        )
                                        if thought:
                                            print(f"\n🤔 Reasoning:\n{thought}\n", flush=True)
                                            sys.stdout.flush()
                                            just_finished_thinking = True
                                            thinking_step_count += 1
                                            yield {
                                                "type": "thinking",
                                                "step": "Reasoning",
                                                "content": thought,
                                            }

                                    elif tool_name == "search_standards":
                                        thinking_step_count += 1
                                        yield {
                                            "type": "thinking",
                                            "step": "Searching",
                                            "content": "Searching knowledge base for solutions…",
                                        }

                                    elif tool_name in (
                                        "write_todos",
                                        "todo_write",
                                        "write_todo_list",
                                        "todo_list",
                                    ):
                                        args = tool_call.get("args", {})
                                        todos = (
                                            args.get("todos", [])
                                            or args.get("todo_list", [])
                                            or args.get("items", [])
                                            or (args if isinstance(args, list) else [])
                                        )
                                        if todos:
                                            todo_text = "\n".join(
                                                f"- {'✅' if isinstance(t, dict) and t.get('status') == 'completed' else '⏳'} "
                                                f"{t.get('content', str(t)) if isinstance(t, dict) else str(t)}"
                                                for t in todos
                                            )
                                            print(f"\n📋 Task Plan ({len(todos)} items):\n{todo_text}\n", flush=True)
                                            sys.stdout.flush()
                                            yield {
                                                "type": "thinking",
                                                "step": "Planning",
                                                "content": f"**Task Plan:**\n\n{todo_text}",
                                            }

                            # ToolMessage results (after execution)
                            for msg in messages:
                                msg_type = type(msg).__name__
                                if not (
                                    msg_type == "ToolMessage"
                                    or (
                                        hasattr(msg, "tool_call_id")
                                        and hasattr(msg, "content")
                                    )
                                ):
                                    continue

                                tool_name = getattr(msg, "name", "")
                                tool_content = getattr(msg, "content", "")

                                # Capture citations from search_standards (Phase 2)
                                if tool_name == "search_standards" and tool_content:
                                    import json
                                    try:
                                        data = (
                                            json.loads(tool_content)
                                            if isinstance(tool_content, str)
                                            else tool_content
                                        )
                                        if isinstance(data, dict) and data.get("found"):
                                            results = data.get("results", [])
                                            citations.extend(results)
                                            logger.info(
                                                f"Captured {len(results)} citations from search_standards"
                                            )
                                    except Exception as ce:
                                        logger.warning(
                                            f"Error parsing search_standards output: {ce}"
                                        )

                                # Todo result updates
                                elif tool_name in (
                                    "write_todos",
                                    "todo_write",
                                    "write_todo_list",
                                    "todo_list",
                                ) and tool_content:
                                    import json
                                    try:
                                        todos_data = (
                                            json.loads(tool_content)
                                            if isinstance(tool_content, str)
                                            else tool_content
                                        )
                                        todos = (
                                            todos_data
                                            if isinstance(todos_data, list)
                                            else (
                                                todos_data.get("todos", [])
                                                if isinstance(todos_data, dict)
                                                else []
                                            )
                                        )
                                        if todos:
                                            todo_text = "\n".join(
                                                f"- {'✅' if isinstance(t, dict) and t.get('status') == 'completed' else '⏳'} "
                                                f"{t.get('content', str(t)) if isinstance(t, dict) else str(t)}"
                                                for t in todos
                                            )
                                            yield {
                                                "type": "thinking",
                                                "step": "Planning",
                                                "content": f"**Task Plan:**\n\n{todo_text}",
                                            }
                                    except Exception:
                                        pass

                    except Exception as e:
                        logger.debug(f"Error capturing tool calls: {e}", exc_info=True)

                # ── messages stream (LLM output tokens) ──────────────────────
                elif stream_mode == "messages":
                    if not (isinstance(chunk, tuple) and len(chunk) == 2):
                        continue

                    message_chunk, metadata = chunk
                    current_node = metadata.get("langgraph_node", "unknown")

                    if current_node in FILTERED_NODES:
                        continue

                    if not (hasattr(message_chunk, "content") and message_chunk.content):
                        continue

                    if isinstance(message_chunk.content, str):
                        token_content = message_chunk.content
                    elif isinstance(message_chunk.content, list):
                        token_content = " ".join(str(item) for item in message_chunk.content)
                    else:
                        token_content = str(message_chunk.content)

                    if not token_content.strip():
                        continue

                    if current_node in RESPONSE_NODES:
                        if not response_started:
                            response_started = True
                            just_finished_thinking = False
                            yield {
                                "type": "progress",
                                "stage": "generating",
                                "step_count": thinking_step_count,
                                "detail": "Generating response…",
                            }
                        yield {
                            "type": "token",
                            "content": token_content,
                            "metadata": {
                                "node": current_node,
                                "model": metadata.get("ls_model_name", "unknown"),
                            },
                        }

                    elif current_node in THINKING_NODES:
                        just_finished_thinking = True
                        continue

            # Yield citations collected from search_standards (Phase 2)
            if citations:
                logger.info(f"Yielding {len(citations)} citations")
                yield {"type": "citations", "citations": citations}

        except Exception as e:
            logger.error(f"Error in QLense streaming: {e}", exc_info=True)
            yield {"type": "error", "content": str(e)}

    # ------------------------------------------------------------------
    # Non-streaming invoke (utility)
    # ------------------------------------------------------------------

    def analyze(self, question: str) -> Dict[str, Any]:
        """Invoke the agent synchronously."""
        try:
            result = self.agent.invoke(
                {"messages": [{"role": "user", "content": question}]}
            )
            if "messages" in result:
                for msg in reversed(result["messages"]):
                    if hasattr(msg, "content") and msg.content:
                        return {"response": msg.content, "success": True}
            return {"response": "Unable to generate answer", "success": False}
        except Exception as e:
            logger.error(f"Error in QLense analysis: {e}")
            return {"response": f"Error: {str(e)}", "success": False, "error": str(e)}
