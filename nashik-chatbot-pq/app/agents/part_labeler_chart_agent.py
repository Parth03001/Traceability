"""
Part Labeler Chart Configuration Sub-Agent

Converts SQL query results into a structured chart configuration for the
dashboard frontend.  Mirrors the CypherAgent pattern:
  - structured output via response_format (Pydantic model)
  - no streaming, no checkpointer
  - called synchronously from the generate_chart @tool

The main PartLabelerDashboardAgent calls generate_chart → this agent so that
chart-layout decisions are offloaded to a specialist LLM call, keeping the
main agent focused on data retrieval and narrative.
"""

import logging
import json
from typing import List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── Prompt ─────────────────────────────────────────────────────────────────

_CHART_AGENT_PROMPT = """You are a chart-configuration specialist for a manufacturing quality analytics dashboard.

Given SQL query results and the user's question, output the BEST chart configuration to visualise the data.

## CHART TYPE RULES

| Condition | Use |
|---|---|
| Data has a date / month / quarter column | `line` (time-series trend) |
| ≤8 categories, user asks about share/distribution/breakdown | `pie` |
| Rankings, comparisons, counts by category | `bar` (default) |

## FIELD SELECTION

- **x_key**: the column with the most descriptive category labels (string, not numeric).
  For time-series: the date/month column.
  Prefer descriptive names over codes (e.g., "failure_mode" over "code_id").
- **y_keys**: ALL numeric columns that represent meaningful metrics (counts, sums, rates).
  Exclude IDs, codes, and text columns.
- **name_key**: (pie charts only) same as x_key — the column for slice labels.
- **value_key**: (pie charts only) the first numeric column — the column for slice sizes.

## TITLE RULES

Be specific — include the metric, grouping dimension, and time period if present.
- Good: "Warranty Claims by Failure Mode – Q1 2026"
- Good: "Monthly RPT Defect Trend – Jan to Mar 2026"
- Bad: "Chart" or "Data" or "Query Results"

## WHEN NOT TO GENERATE A CHART

Set `should_generate = false` when:
- Only 1 data row exists (nothing to compare)
- All columns are text (no numeric values)
- The query returned an error

Output ONLY the JSON schema. No extra explanation."""


# ── Structured output schema ────────────────────────────────────────────────

class ChartConfig(BaseModel):
    """Structured chart configuration returned by the chart sub-agent."""

    should_generate: bool = Field(
        description="True if the data is suitable for a chart (≥2 rows with at least one numeric column)."
    )
    chart_type: str = Field(
        description="Chart type: 'bar', 'line', or 'pie'."
    )
    title: str = Field(
        description="Concise, descriptive chart title including metric and grouping."
    )
    x_key: str = Field(
        description="Column name for x-axis (bar/line) or category labels (pie)."
    )
    y_keys: List[str] = Field(
        description="Column names for y-axis numeric values (bar/line charts)."
    )
    name_key: Optional[str] = Field(
        default=None,
        description="Column name for pie chart slice labels (usually same as x_key)."
    )
    value_key: Optional[str] = Field(
        default=None,
        description="Column name for pie chart slice values (the numeric column)."
    )


# ── Agent ───────────────────────────────────────────────────────────────────

class PartLabelerChartAgent:
    """
    Lightweight sub-agent that converts SQL query results into a chart config.

    Uses the same cheap/fast model as CypherAgent (low-temperature structured
    output) — does NOT stream and does NOT use a checkpointer.
    """

    def __init__(self):
        from app.models.model_factory import ModelFactory

        # Use the same model as CypherAgent — optimised for structured output
        self.llm = ModelFactory.get_default_chat_model()
        self.agent = None
        self._initialize_agent()

    def _initialize_agent(self):
        try:
            from langchain.agents import create_agent

            self.agent = create_agent(
                model=self.llm,
                tools=[],
                system_prompt=_CHART_AGENT_PROMPT,
                response_format=ChartConfig,
                name="part_labeler_chart_agent",
            )
            logger.info("PartLabelerChartAgent initialised successfully")
        except Exception as exc:
            logger.error(f"PartLabelerChartAgent init error: {exc}")
            raise

    # ── Public API ──────────────────────────────────────────────────────────

    def generate(
        self,
        query_results: List[dict],
        user_question: str,
    ) -> Optional[dict]:
        """
        Generate a chart configuration from SQL query results.

        Args:
            query_results: List of row dicts from execute_read_query "data" field.
            user_question: The user's original question (provides title context).

        Returns:
            Chart config dict compatible with the frontend ChartComponent, or None
            if the data is not suitable for charting.
        """
        if not query_results or len(query_results) < 2:
            logger.debug("Chart generation skipped: fewer than 2 rows")
            return None

        # Compact sample — up to 50 rows to avoid overwhelming the prompt
        sample = query_results[:50]
        columns = list(query_results[0].keys())

        user_prompt = (
            f"User question: {user_question}\n\n"
            f"Columns: {columns}\n"
            f"Total rows: {len(query_results)}\n"
            f"Sample data (up to 50 rows):\n"
            f"{json.dumps(sample, default=str)}"
        )

        try:
            response = self.agent.invoke(
                {"messages": [{"role": "user", "content": user_prompt}]}
            )

            # ── Extract ChartConfig — mirrors CypherAgent pattern ───────────
            # create_agent with response_format stores the Pydantic object at
            # result["structured_response"] (not result["messages"]).
            config: Optional[ChartConfig] = None

            if isinstance(response, dict):
                sr = response.get("structured_response")
                if isinstance(sr, ChartConfig):
                    config = sr
                elif isinstance(sr, dict):
                    try:
                        config = ChartConfig(**sr)
                    except Exception:
                        pass

            if config is None:
                # Fallback: try to parse JSON from the last message content
                import re as _re
                messages = (response.get("messages") or []) if isinstance(response, dict) else []
                for msg in reversed(messages):
                    raw = getattr(msg, "content", "")
                    if not isinstance(raw, str):
                        continue
                    # Try direct JSON parse first, then regex extraction
                    for candidate in [raw, (_re.search(r"\{[\s\S]*\}", raw) or _re.Match()).group() if _re.search(r"\{[\s\S]*\}", raw) else None]:
                        if not candidate:
                            continue
                        try:
                            config = ChartConfig(**json.loads(candidate))
                            break
                        except Exception:
                            continue
                    if config is not None:
                        break

            if config is None or not config.should_generate:
                logger.debug(
                    f"Chart agent: should_generate=False or no config parsed "
                    f"(response keys: {list(response.keys()) if isinstance(response, dict) else type(response)})"
                )
                return None

            return self._build_chart_data(config, query_results)

        except Exception as exc:
            logger.error(f"PartLabelerChartAgent.generate error: {exc}", exc_info=True)
            return None

    # ── Internal ────────────────────────────────────────────────────────────

    @staticmethod
    def _build_chart_data(config: ChartConfig, data: List[dict]) -> dict:
        """Convert a ChartConfig into the dict shape the frontend ChartComponent expects."""

        def _label(key: str) -> str:
            return key.replace("_", " ").title()

        chart = {
            "type": config.chart_type,
            "title": config.title,
            "data": data,
            "config": {},
        }

        if config.chart_type == "pie":
            chart["config"]["nameKey"] = config.name_key or config.x_key
            chart["config"]["valueKey"] = (
                config.value_key or (config.y_keys[0] if config.y_keys else None)
            )
        else:
            chart["config"]["xAxis"] = config.x_key
            chart["config"]["yAxis"] = config.y_keys or []
            chart["config"]["xAxisLabel"] = _label(config.x_key)
            chart["config"]["yAxisLabel"] = (
                _label(config.y_keys[0]) if config.y_keys else "Value"
            )

        return chart
