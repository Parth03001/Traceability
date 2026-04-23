"""
Quality Analyst Agent
Analyzes Neo4j query results and provides quality insights
"""

import logging
import json
import sys
from typing import Dict, Any, Generator, Optional

# Lazy import to avoid loading torch/transformers on every reload
# from langchain.agents import create_agent
from app.services.prompt_manager import (
    get_analyst_prompt,
    get_todo_list_middleware_prompt,
)
from app.models.model_factory import ModelFactory
from app.utils.query_executor import QueryExecutor
from app.utils.chart_formatter import format_neo4j_results_for_chart
from app.connectors.neo4j_connector import Neo4jConnector

logger = logging.getLogger(__name__)


class AnalystAgent:
    """
    Agent that analyzes quality data from Neo4j and provides insights
    Uses tools to execute queries and analyze results
    """

    def __init__(
        self,
        neo4j_connector: Neo4jConnector = None,
        thread_id: str = "default",
        checkpointer=None,
        enable_summarization: bool = True,
        summarization_trigger_tokens: int = 100000,  # Trigger at 100K tokens (before 128K limit)
        keep_recent_messages: int = 20,  # Keep last 20 messages after summarization
    ):
        """
        Initialize Analyst Agent with automatic context summarization

        Args:
            neo4j_connector: Optional Neo4j connector
            thread_id: Thread ID for conversation tracking
            checkpointer: Optional PostgresSaver for conversation memory persistence
            enable_summarization: Enable automatic conversation summarization (default: True)
            summarization_trigger_tokens: Token count to trigger summarization (default: 100K)
            keep_recent_messages: Number of recent messages to keep after summarization (default: 20)
        """
        self.neo4j = neo4j_connector or Neo4jConnector()
        self.query_executor = QueryExecutor(self.neo4j)
        self.llm = ModelFactory.get_analyst_model()
        self.thread_id = thread_id
        self.checkpointer = checkpointer
        self.enable_summarization = enable_summarization
        self.summarization_trigger_tokens = summarization_trigger_tokens
        self.keep_recent_messages = keep_recent_messages
        self.agent = None
        # Store chart data for the current query
        self.current_chart_data = None
        self.current_user_question = None
        self._initialize_agent()

    def _initialize_agent(self):
        """Initialize the LangChain agent with tools"""
        try:
            # Define tools
            def execute_cypher_query(question: str) -> Dict[str, Any]:
                """
                Generate and execute a Cypher query based on the user's question.
                Returns the query results as a dictionary.

                Args:
                    question: The user's question in natural language
                """
                from app.agents.cypher_agent import CypherAgent

                cypher_agent = CypherAgent(self.neo4j)
                cypher_result = cypher_agent.generate_query(question)

                if not cypher_result.get("success"):
                    return {
                        "query": None,
                        "records": [],
                        "error": cypher_result.get("error", "Failed to generate query"),
                    }

                # Execute the generated query
                query = cypher_result["cypher_query"]
                result = self.query_executor.execute_cypher(query)

                # Check if we should generate a chart for these results
                if result.get("success") and result.get("records"):
                    try:
                        # Use the current user question for context
                        user_question = (
                            self.current_user_question
                            if hasattr(self, "current_user_question")
                            and self.current_user_question
                            else question
                        )
                        chart_data = format_neo4j_results_for_chart(
                            result["records"], user_question
                        )
                        if chart_data and not self.current_chart_data:
                            # Keep the FIRST chart data (parts overview) for simplicity
                            # Don't overwrite with subsequent complex queries
                            # (batch/vendor/ESQA charts are too detailed)
                            self.current_chart_data = chart_data
                            logger.info(f"Generated chart data: {chart_data.get('type')} chart")
                    except Exception as e:
                        logger.warning(f"Could not generate chart data: {e}")

                return result

            def get_schema() -> Dict[str, Any]:
                """Get the schema for the graph database."""
                return self.neo4j.get_schema()

            # Import think tool for reasoning
            from app.tools.think_tool import think

            # Lazy import to avoid loading heavy dependencies on module import
            from langchain.agents import create_agent
            from langchain.agents.middleware import (
                SummarizationMiddleware,
                TodoListMiddleware,
            )

            # Create agent with tools and optional checkpointer
            # Load prompt from database (with fallback to default)
            analyst_prompt = get_analyst_prompt()

            agent_kwargs = {
                "model": self.llm,
                "tools": [execute_cypher_query, get_schema, think],
                "system_prompt": analyst_prompt,
                "name": "analyst_agent",
            }

            # Add checkpointer if available (for conversation memory)
            if self.checkpointer is not None:
                agent_kwargs["checkpointer"] = self.checkpointer
                logger.info(
                    f"✅ Analyst agent initialized with PostgreSQL memory "
                    f"(thread_id: {self.thread_id})"
                )
            else:
                logger.warning(
                    "⚠️  Analyst agent initialized without persistent memory. "
                    "Conversation history will not persist across sessions."
                )

            # Add middleware for enhanced reasoning and planning
            middleware = []

            # Add TodoListMiddleware for planning multi-step tasks
            # Load prompt from database (with fallback to default)
            todo_middleware_prompt = get_todo_list_middleware_prompt()
            todo_middleware = TodoListMiddleware(system_prompt=todo_middleware_prompt)
            middleware.append(todo_middleware)
            logger.info("✅ TodoListMiddleware enabled for task planning")

            # Log available tools after middleware is added
            # Note: TodoListMiddleware adds write_todos tool automatically
            logger.info("📋 write_todos tool will be available via TodoListMiddleware")

            # Add summarization middleware to prevent context length errors
            if self.enable_summarization:
                # Use Azure OpenAI model for summarization (same config as main agent)
                summarization_model = ModelFactory.get_default_chat_model()
                middleware.append(
                    SummarizationMiddleware(
                        model=summarization_model,  # Use Azure OpenAI model instance
                        trigger=(
                            "tokens",
                            self.summarization_trigger_tokens,
                        ),  # Tuple format!
                        keep=("messages", self.keep_recent_messages),  # Tuple format!
                        trim_tokens_to_summarize=4000,  # Limit tokens when generating summary
                    )
                )
                logger.info(
                    f"🔄 Summarization enabled: triggers at {self.summarization_trigger_tokens} tokens, "
                    f"keeps {self.keep_recent_messages} recent messages"
                )

            if middleware:
                agent_kwargs["middleware"] = middleware
            self.agent = create_agent(**agent_kwargs)

            # Verify tools are available (including write_todos from TodoListMiddleware)
            # Note: TodoListMiddleware adds write_todos tool automatically to the agent
            try:
                # The agent's tools are managed by LangChain, and TodoListMiddleware
                # automatically injects write_todos tool into the agent's tool list
                # The tool is added dynamically during agent execution, not at initialization
                logger.info(
                    "📋 TodoListMiddleware should provide write_todos tool automatically during execution"
                )

                # Try to inspect the agent's graph to see if write_todos is available
                if hasattr(self.agent, "get_graph"):
                    graph = self.agent.get_graph()
                    logger.debug(
                        f"Agent graph nodes: {list(graph.nodes.keys()) if hasattr(graph, 'nodes') else 'N/A'}"
                    )
            except Exception as e:
                logger.debug(f"Could not inspect agent graph: {e}")

            logger.info("Analyst agent initialized successfully")

        except Exception as e:
            logger.error(f"Error initializing Analyst agent: {e}")
            raise

    def analyze(self, question: str) -> Dict[str, Any]:
        """
        Analyze a question and return insights

        Args:
            question: User question about quality/warranty data

        Returns:
            Analysis results
        """
        try:
            logger.info(f"Analyzing question: {question[:100]}...")

            result = self.agent.invoke(
                {"messages": [{"role": "user", "content": question}]}
            )
            # Extract the final response
            if "messages" in result:
                messages = result["messages"]
                # Get the last AI message
                for msg in reversed(messages):
                    if hasattr(msg, "content") and msg.content:
                        return {"response": msg.content, "success": True}

            return {"response": "Unable to generate analysis", "success": False}

        except Exception as e:
            logger.error(f"Error in analysis: {e}")
            return {"response": f"Error: {str(e)}", "success": False, "error": str(e)}

    def stream(self, user_question: str) -> Generator[Dict[str, Any], None, None]:
        """
        Stream analysis updates in real-time using stream_mode=["custom", "messages"]
        Matches Agentic-AI-Framework QA/Jira handler pattern

        Args:
            user_question: User question

        Yields:
            Streaming events
        """
        try:
            logger.info(f"Streaming analysis for: {user_question[:100]}...")

            # Store the user question for chart generation context
            self.current_user_question = user_question
            self.current_chart_data = None

            # Track the full response for chart title extraction
            full_response_text = []

            # Create input messages
            inputs = {"messages": [{"role": "user", "content": user_question}]}

            # Configuration with thread ID
            config = {"configurable": {"thread_id": self.thread_id}}

            # Define node categories (like qa_handler.py pattern)
            # Nodes that should emit final response tokens
            RESPONSE_NODES = {"analyst_agent", "assistant", "model", "__end__"}

            # Nodes that should show as thinking steps
            THINKING_NODES = {"tools", "agent:edges"}

            # Nodes to filter out completely (don't show cypher queries, tool calls)
            FILTERED_NODES = {"cypher_agent", "query_executor", "tools:edges"}

            # Track streaming state
            just_finished_thinking = False
            response_started = False
            thinking_step_count = 0

            # Stream with multiple modes to capture all events
            for stream_mode, chunk in self.agent.stream(
                inputs, config, stream_mode=["custom", "messages", "updates"]
            ):
                # Handle custom stream (thinking steps from StreamWriter)
                if stream_mode == "custom":
                    if isinstance(chunk, dict) and "thinking" in chunk:
                        node_name = chunk.get("node", "unknown")

                        # Skip filtered nodes
                        if node_name in FILTERED_NODES:
                            continue

                        # Map node names to user-friendly names
                        step_name_map = {
                            "tools": "Processing Query",
                        }
                        step_name = step_name_map.get(node_name, node_name)

                        just_finished_thinking = True
                        thinking_step_count += 1

                        yield {
                            "type": "thinking",
                            "step": step_name,
                            "content": chunk.get("thinking", ""),
                        }

                # Handle updates stream (tool calls, state changes)
                elif stream_mode == "updates":
                    # Capture tool calls for think and write_todos
                    # LangGraph updates stream: {node_name: {messages: [...], ...}}
                    try:
                        if isinstance(chunk, dict):
                            for node_name, node_data in chunk.items():
                                if (
                                    isinstance(node_data, dict)
                                    and "messages" in node_data
                                ):
                                    # Get the last message (most recent)
                                    messages = node_data["messages"]
                                    if not messages:
                                        continue

                                    last_msg = messages[-1]

                                    # Check for AIMessage with tool_calls (before execution)
                                    if (
                                        hasattr(last_msg, "tool_calls")
                                        and last_msg.tool_calls
                                    ):
                                        for tool_call in last_msg.tool_calls:
                                            tool_name = tool_call.get("name", "")
                                            # Debug: Log all tool names to see what's actually being called
                                            logger.info(
                                                f"🔧 Tool call detected: name='{tool_name}', args keys={list(tool_call.get('args', {}).keys()) if isinstance(tool_call.get('args'), dict) else 'N/A'}"
                                            )

                                            # Capture think tool calls
                                            if tool_name == "think":
                                                args = tool_call.get("args", {})
                                                thought = (
                                                    args.get("thought", "")
                                                    if isinstance(args, dict)
                                                    else str(args)
                                                )
                                                if thought:
                                                    # Print to terminal (flush immediately)
                                                    print(
                                                        f"\n🤔 Reasoning:\n{thought}\n",
                                                        flush=True,
                                                    )
                                                    sys.stdout.flush()
                                                    thinking_step_count += 1
                                                    # Emit thinking event for web UI
                                                    thinking_event = {
                                                        "type": "thinking",
                                                        "step": "Reasoning",
                                                        "content": thought,
                                                    }
                                                    yield thinking_event

                                            # Capture todo-related tool calls (check multiple possible names)
                                            elif tool_name in [
                                                "write_todos",
                                                "todo_write",
                                                "write_todo_list",
                                                "todo_list",
                                            ]:
                                                logger.info(
                                                    f"📋 Detected todo tool with name: '{tool_name}'"
                                                )
                                                args = tool_call.get("args", {})
                                                # Try different possible argument names
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
                                                if not todos and isinstance(args, dict):
                                                    # If args is a dict but no todos key, log all keys for debugging
                                                    logger.info(
                                                        f"📋 Todo tool args keys: {list(args.keys())}"
                                                    )

                                                if todos:
                                                    todo_text = "\n".join(
                                                        [
                                                            f"- {'✅' if isinstance(todo, dict) and todo.get('status') == 'completed' else '⏳'} {todo.get('content', str(todo)) if isinstance(todo, dict) else str(todo)}"
                                                            for todo in todos
                                                        ]
                                                    )
                                                    # Print to terminal (flush immediately)
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
                                                else:
                                                    logger.warning(
                                                        f"📋 Todo tool called but no todos found in args: {args}"
                                                    )

                                    # Check for ToolMessage (tool results after execution)
                                    # Note: For think tool, we capture from tool call args, not return value
                                    msg_type = type(last_msg).__name__
                                    if msg_type == "ToolMessage" or (
                                        hasattr(last_msg, "name")
                                        and hasattr(last_msg, "content")
                                    ):
                                        tool_name = getattr(last_msg, "name", "")
                                        tool_content = getattr(last_msg, "content", "")
                                        # Debug: Log all tool results to see what's actually being returned
                                        logger.info(
                                            f"🔧 Tool result detected: name='{tool_name}', content type={type(tool_content).__name__}"
                                        )

                                        # Skip think tool results - thought is captured from tool call args above
                                        # For todo-related tool results (check multiple possible names)
                                        if (
                                            tool_name
                                            in [
                                                "write_todos",
                                                "todo_write",
                                                "write_todo_list",
                                                "todo_list",
                                            ]
                                            and tool_content
                                        ):
                                            logger.info(
                                                f"📋 Todo tool result with name: '{tool_name}'"
                                            )
                                            # Try to parse todos from content
                                            import json

                                            try:
                                                if isinstance(tool_content, str):
                                                    # Try to parse as JSON
                                                    todos_data = json.loads(
                                                        tool_content
                                                    )
                                                    todos = (
                                                        todos_data
                                                        if isinstance(todos_data, list)
                                                        else todos_data.get("todos", [])
                                                    )
                                                else:
                                                    todos = (
                                                        tool_content
                                                        if isinstance(
                                                            tool_content, list
                                                        )
                                                        else tool_content.get(
                                                            "todos", []
                                                        )
                                                    )

                                                if todos:
                                                    todo_text = "\n".join(
                                                        [
                                                            f"- {'✅' if isinstance(todo, dict) and todo.get('status') == 'completed' else '⏳'} {todo.get('content', str(todo)) if isinstance(todo, dict) else str(todo)}"
                                                            for todo in todos
                                                        ]
                                                    )
                                                    # Print to terminal (flush immediately)
                                                    print(
                                                        f"\n📋 Task Plan Updated ({len(todos)} items):\n{todo_text}\n",
                                                        flush=True,
                                                    )
                                                    sys.stdout.flush()
                                                    yield {
                                                        "type": "thinking",
                                                        "step": "Planning",
                                                        "content": f"**Task Plan:**\n\n{todo_text}",
                                                    }
                                            except:
                                                # If parsing fails, just log it
                                                logger.debug(
                                                    f"Could not parse todo content: {tool_content}"
                                                )
                    except Exception as e:
                        # Don't break streaming if tool capture fails
                        logger.debug(f"Error capturing tool calls: {e}", exc_info=True)

                # Handle message stream (actual LLM output)
                elif stream_mode == "messages":
                    if isinstance(chunk, tuple) and len(chunk) == 2:
                        message_chunk, metadata = chunk
                        current_node = metadata.get("langgraph_node", "unknown")

                        # Skip filtered nodes completely
                        if current_node in FILTERED_NODES:
                            continue

                        # Stream content tokens
                        if hasattr(message_chunk, "content") and message_chunk.content:
                            # Normalize content
                            if isinstance(message_chunk.content, str):
                                token_content = message_chunk.content
                            elif isinstance(message_chunk.content, list):
                                token_content = " ".join(
                                    str(item) for item in message_chunk.content
                                )
                            else:
                                token_content = str(message_chunk.content)

                            # Skip empty content
                            if not token_content.strip():
                                continue

                            # Handle response nodes - emit final answer tokens
                            if current_node in RESPONSE_NODES:
                                if not response_started:
                                    # Add small delay between thinking and response
                                    if just_finished_thinking:
                                        import time
                                        time.sleep(0.3)
                                    just_finished_thinking = False
                                    response_started = True
                                    yield {
                                        "type": "progress",
                                        "stage": "generating",
                                        "step_count": thinking_step_count,
                                        "detail": "Generating response…",
                                    }

                                # Collect response text for chart title extraction
                                full_response_text.append(token_content)

                                yield {
                                    "type": "token",
                                    "content": token_content,
                                    "metadata": {
                                        "node": current_node,
                                        "model": metadata.get(
                                            "ls_model_name", "unknown"
                                        ),
                                    },
                                }

                            # Handle thinking nodes - skip these, we capture from tool calls
                            # Don't emit thinking_token as it's just internal processing
                            elif current_node in THINKING_NODES:
                                just_finished_thinking = True
                                # Skip - we already capture thinking from tool calls above
                                continue

            # After streaming completes, emit chart data if available
            if self.current_chart_data:
                # Try to extract chart title from agent's response
                full_response = "".join(full_response_text)
                from app.utils.chart_formatter import _extract_chart_title_from_response

                extracted_title = _extract_chart_title_from_response(full_response)

                # Update chart title if extracted from response
                if extracted_title:
                    self.current_chart_data["title"] = extracted_title
                    logger.info(f"Using agent-provided chart title: {extracted_title}")
                else:
                    logger.info(f"Using auto-generated chart title: {self.current_chart_data.get('title')}")

                logger.info(f"Emitting chart data: {self.current_chart_data.get('type')}")
                yield {
                    "type": "chart",
                    "chart_data": self.current_chart_data,
                }
                # Clear chart data after emitting
                self.current_chart_data = None

        except Exception as e:
            logger.error(f"Error in streaming: {e}", exc_info=True)
            yield {"type": "error", "content": str(e)}

    def get_current_state(self) -> Any:
        """
        Get current agent state (if available)

        Returns:
            Agent state or None
        """
        try:
            # LangGraph agents may have state
            if hasattr(self.agent, "get_state"):
                return self.agent.get_state()
            return None
        except Exception:
            return None
