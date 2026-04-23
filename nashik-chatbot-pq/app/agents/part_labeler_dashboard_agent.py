"""
Part Labeler Dashboard Agent
Answers analytical questions by running read-only SQL queries against
the Part Labeler PostgreSQL tables (warranty, RPT, GNOVAC, RFI, e-SQA).
"""

import logging
import sys
from typing import Dict, Any, Generator

logger = logging.getLogger(__name__)


class PartLabelerDashboardAgent:
    """
    Agent that answers questions about Part Labeler quality data by
    querying PostgreSQL tables.

    Tools available:
      - get_part_labeler_schema : fetch table/column definitions
      - execute_read_query      : run SELECT-only SQL
      - think                   : reasoning scratchpad
    Middleware: TodoListMiddleware, SummarizationMiddleware (same stack
    as AnalystAgent / StandardsGuidelinesAgent).
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
        """Build the LangChain agent with Part Labeler tools."""
        try:
            from app.tools.pg_schema_tool import get_part_labeler_schema
            from app.tools.pg_query_tool import execute_read_query
            from app.tools.chart_generator_tool import generate_chart
            from app.tools.think_tool import think
            from app.services.prompt_manager import (
                get_part_labeler_dashboard_prompt,
                get_todo_list_middleware_prompt,
            )
            from langchain.agents import create_agent
            from langchain.agents.middleware import (
                SummarizationMiddleware,
                TodoListMiddleware,
            )

            prompt = get_part_labeler_dashboard_prompt()

            agent_kwargs = {
                "model": self.llm,
                "tools": [get_part_labeler_schema, execute_read_query, generate_chart, think],
                "system_prompt": prompt,
                "name": "part_labeler_dashboard_agent",
            }

            if self.checkpointer is not None:
                agent_kwargs["checkpointer"] = self.checkpointer
                logger.info(
                    f"✅ Part Labeler Dashboard agent initialised with PostgreSQL memory "
                    f"(thread_id: {self.thread_id})"
                )
            else:
                logger.warning(
                    "⚠️  Part Labeler Dashboard agent initialised without persistent memory."
                )

            middleware = []

            todo_prompt = get_todo_list_middleware_prompt()
            middleware.append(TodoListMiddleware(system_prompt=todo_prompt))
            logger.info("✅ TodoListMiddleware enabled")

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
            logger.info("Part Labeler Dashboard agent initialised successfully")

        except Exception as e:
            logger.error(f"Error initialising Part Labeler Dashboard agent: {e}")
            raise

    # ------------------------------------------------------------------
    # Streaming (same event-shape as AnalystAgent — frontend compatible)
    # ------------------------------------------------------------------

    def stream(self, user_question: str) -> Generator[Dict[str, Any], None, None]:
        """
        Stream responses in real-time.

        Yields the same event types as AnalystAgent:
            {"type": "thinking", "step": str,     "content": str}
            {"type": "token",    "content": str,  "metadata": {...}}
            {"type": "chart",    "chart_data": dict}
            {"type": "progress", "stage": str,    "step_count": int}
            {"type": "error",    "content": str}
        """
        try:
            logger.info(
                f"Streaming Part Labeler Dashboard for: {user_question[:100]}…"
            )

            # Clear any chart left over from a previous call on this thread
            from app.tools.chart_generator_tool import (
                clear_pending_chart,
                get_pending_chart,
            )
            clear_pending_chart()

            inputs = {"messages": [{"role": "user", "content": user_question}]}
            config = {"configurable": {"thread_id": self.thread_id}}

            RESPONSE_NODES = {
                "part_labeler_dashboard_agent",
                "assistant",
                "model",
                "__end__",
            }
            THINKING_NODES = {"tools", "agent:edges"}
            FILTERED_NODES = {"tools:edges"}

            just_finished_thinking = False
            response_started = False
            thinking_step_count = 0
            pending_chart = None  # Captured from generate_chart ToolMessage

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
                                    logger.info(
                                        f"🔧 Tool call: '{tool_name}'"
                                    )

                                    if tool_name == "think":
                                        args = tool_call.get("args", {})
                                        thought = (
                                            args.get("thought", "")
                                            if isinstance(args, dict)
                                            else str(args)
                                        )
                                        if thought:
                                            print(
                                                f"\n🤔 Reasoning:\n{thought}\n",
                                                flush=True,
                                            )
                                            sys.stdout.flush()
                                            just_finished_thinking = True
                                            thinking_step_count += 1
                                            yield {
                                                "type": "thinking",
                                                "step": "Reasoning",
                                                "content": thought,
                                            }

                                    elif tool_name == "generate_chart":
                                        # Show a brief thinking step so the user
                                        # knows a chart is being prepared
                                        thinking_step_count += 1
                                        yield {
                                            "type": "thinking",
                                            "step": "Charting",
                                            "content": "Generating chart from query results…",
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
                                            or (
                                                args
                                                if isinstance(args, list)
                                                else []
                                            )
                                        )
                                        if todos:
                                            todo_text = "\n".join(
                                                f"- {'✅' if isinstance(t, dict) and t.get('status') == 'completed' else '⏳'} "
                                                f"{t.get('content', str(t)) if isinstance(t, dict) else str(t)}"
                                                for t in todos
                                            )
                                            print(
                                                f"\n📋 Task Plan ({len(todos)} items):\n{todo_text}\n",
                                                flush=True,
                                            )
                                            sys.stdout.flush()
                                            yield {
                                                "type": "thinking",
                                                "step": "Planning",
                                                "content": f"**Task Plan:**\n\n{todo_text}",
                                            }

                            # ToolMessage results
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

                                if tool_name == "generate_chart" and tool_content:
                                    # Capture chart_data directly from the ToolMessage.
                                    # This is reliable regardless of thread-local scope.
                                    import json as _json
                                    try:
                                        result = (
                                            _json.loads(tool_content)
                                            if isinstance(tool_content, str)
                                            else tool_content
                                        )
                                        if (
                                            isinstance(result, dict)
                                            and result.get("success")
                                            and result.get("chart_data")
                                        ):
                                            pending_chart = result["chart_data"]
                                            logger.info(
                                                f"Chart captured from ToolMessage: "
                                                f"type={pending_chart.get('type')!r}, "
                                                f"title={pending_chart.get('title')!r}"
                                            )
                                    except Exception as _ce:
                                        logger.debug(f"generate_chart ToolMessage parse error: {_ce}")

                                elif (
                                    tool_name
                                    in (
                                        "write_todos",
                                        "todo_write",
                                        "write_todo_list",
                                        "todo_list",
                                    )
                                    and tool_content
                                ):
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
                        logger.debug(
                            f"Error capturing tool calls: {e}", exc_info=True
                        )

                # ── messages stream (LLM output tokens) ──────────────────────
                elif stream_mode == "messages":
                    if not (isinstance(chunk, tuple) and len(chunk) == 2):
                        continue

                    message_chunk, metadata = chunk
                    current_node = metadata.get("langgraph_node", "unknown")

                    if current_node in FILTERED_NODES:
                        continue

                    if not (
                        hasattr(message_chunk, "content") and message_chunk.content
                    ):
                        continue

                    if isinstance(message_chunk.content, str):
                        token_content = message_chunk.content
                    elif isinstance(message_chunk.content, list):
                        token_content = " ".join(
                            str(item) for item in message_chunk.content
                        )
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

            # ── Emit chart if the generate_chart tool produced one ──────────
            # Primary: captured from ToolMessage in the updates loop (thread-safe)
            # Fallback: thread-local written by the tool (same-thread only)
            if pending_chart is None:
                pending_chart = get_pending_chart()
            if pending_chart:
                logger.info(
                    f"Emitting chart: type={pending_chart.get('type')!r}, "
                    f"title={pending_chart.get('title')!r}"
                )
                yield {"type": "chart", "chart_data": pending_chart}

        except Exception as e:
            logger.error(
                f"Error in Part Labeler Dashboard streaming: {e}", exc_info=True
            )
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
            logger.error(f"Error in Part Labeler Dashboard analysis: {e}")
            return {"response": f"Error: {str(e)}", "success": False, "error": str(e)}
