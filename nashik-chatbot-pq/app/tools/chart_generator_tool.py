"""
Chart Generator Tool — Part Labeler Dashboard Agent

A LangChain @tool wrapper around PartLabelerChartAgent.
The main agent calls this after execute_read_query to generate chart configs
without having to decide layout details itself.

The tool stores the generated chart in a thread-local so the
PartLabelerDashboardAgent.stream() loop can pick it up and emit a
{"type": "chart", "chart_data": ...} event — exactly the same mechanism
used by AnalystAgent.
"""

import logging
import json
import threading
from typing import Optional, Dict, Any

from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# ── Thread-local chart storage ──────────────────────────────────────────────
# The main streaming loop in PartLabelerDashboardAgent.stream() reads from
# _chart_store after the generator exhausts, then emits the chart event.
# LangGraph executes sync tools synchronously within the same graph thread,
# so the thread-local written by the tool is readable from stream() after the loop.

_chart_store: threading.local = threading.local()


def get_pending_chart() -> Optional[Dict[str, Any]]:
    """Return the last chart generated in this thread, then clear it."""
    chart = getattr(_chart_store, "chart", None)
    _chart_store.chart = None
    return chart


def clear_pending_chart() -> None:
    """Clear any pending chart (call at the start of each stream)."""
    _chart_store.chart = None


# ── Singleton chart agent ────────────────────────────────────────────────────
# Initialised once on first use; avoids creating a new LangChain agent graph
# on every generate_chart tool call.
_chart_agent_instance = None
_chart_agent_lock = threading.Lock()


def _get_chart_agent():
    global _chart_agent_instance
    if _chart_agent_instance is None:
        with _chart_agent_lock:
            if _chart_agent_instance is None:
                from app.agents.part_labeler_chart_agent import PartLabelerChartAgent
                _chart_agent_instance = PartLabelerChartAgent()
    return _chart_agent_instance


# ── Tool ────────────────────────────────────────────────────────────────────

@tool
def generate_chart(query_results_json: str, user_question: str) -> str:
    """
    Convert SQL query results into a chart configuration for dashboard visualisation.

    Call this after execute_read_query whenever the result:
      - Has ≥2 rows
      - Contains at least one numeric column (count, total, percentage, qty, etc.)
      - Has a categorical or time-based grouping column

    Do NOT call this for:
      - Single-row / single-value results (e.g., COUNT(*) = 715 with no breakdown)
      - Text-only results
      - Error results from execute_read_query

    Args:
        query_results_json: The "data" array from execute_read_query (JSON string).
                            Pass the list directly — e.g., json.dumps(result["data"]).
                            Alternatively pass the full execute_read_query response and
                            the tool will extract the "data" key automatically.
        user_question: The user's original question, used to craft a descriptive chart title.

    Returns:
        JSON string with keys:
            success     (bool)
            message     (str)   — "Chart generated" or reason why not generated
    """
    try:
        # Parse input
        if isinstance(query_results_json, str):
            try:
                parsed = json.loads(query_results_json)
            except json.JSONDecodeError:
                return json.dumps({"success": False, "message": "Invalid JSON input"})
        else:
            parsed = query_results_json

        # Accept either the full execute_read_query response or just the data array
        if isinstance(parsed, dict) and "data" in parsed:
            rows = parsed["data"]
        elif isinstance(parsed, list):
            rows = parsed
        else:
            return json.dumps({
                "success": False,
                "message": "Input must be a JSON array of row dicts or the full execute_read_query response",
            })

        if not rows or len(rows) < 2:
            return json.dumps({
                "success": False,
                "message": f"Need ≥2 rows for a chart (got {len(rows) if rows else 0})",
            })

        chart_agent = _get_chart_agent()
        chart_data = chart_agent.generate(query_results=rows, user_question=user_question)

        if chart_data is None:
            # Fallback: use the rule-based formatter so charts always render
            # when data is suitable, even if the LLM sub-agent can't produce
            # structured output.
            try:
                from app.utils.chart_formatter import format_neo4j_results_for_chart
                chart_data = format_neo4j_results_for_chart(rows, user_question)
            except Exception as _fe:
                logger.debug(f"Rule-based chart fallback failed: {_fe}")

        if chart_data is None:
            return json.dumps({
                "success": False,
                "message": "Chart agent determined the data is not suitable for charting",
            })

        # Also store in thread-local as a backup (works when tool runs in same thread)
        _chart_store.chart = chart_data
        logger.info(
            f"Chart generated: type={chart_data.get('type')}, title={chart_data.get('title')!r}"
        )

        # Return chart_data embedded in the tool result so the stream() loop can
        # capture it directly from the ToolMessage — this is the reliable path
        # regardless of which thread the tool executor uses.
        return json.dumps({
            "success": True,
            "message": f"Chart generated: {chart_data.get('type', 'bar')} — \"{chart_data.get('title', '')}\"",
            "chart_data": chart_data,
        })

    except Exception as exc:
        logger.error(f"generate_chart tool error: {exc}", exc_info=True)
        return json.dumps({"success": False, "message": str(exc)})
