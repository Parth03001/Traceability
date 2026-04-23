"""
Part Labeler Read Query Tool
Executes read-only SQL SELECT queries against part labeler PostgreSQL tables.
All modification queries are blocked for security.
"""

import logging
import json
import re
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# Tables the agent is allowed to query
ALLOWED_TABLES = {
    "raw_warranty_data",
    "raw_rpt_data",
    "raw_gnovac_data",
    "raw_rfi_data",
    "raw_esqa_data",
}

# Regex to detect any data-modification or DDL statement
_BLOCKED_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|UPSERT"
    r"|GRANT|REVOKE|EXEC|EXECUTE|CALL|DO|SET\s+[a-z]|COPY|VACUUM|CLUSTER"
    r"|REINDEX|RESET|LOAD|IMPORT|EXPORT|COMMENT\s+ON|LOCK\s+TABLE)\b",
    re.IGNORECASE,
)

# Maximum rows to return to avoid overwhelming context
_MAX_ROWS = 200


@tool
def execute_read_query(sql_query: str) -> str:
    """
    Execute a READ-ONLY SQL SELECT query against the Part Labeler database.

    SECURITY RULES (strictly enforced):
    - Only SELECT (or WITH … SELECT) statements are accepted.
    - INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE and all other
      data-modification or DDL keywords are BLOCKED.
    - Only the following tables may be queried:
        * raw_warranty_data
        * raw_rpt_data
        * raw_gnovac_data
        * raw_rfi_data
        * raw_esqa_data

    USAGE GUIDELINES:
    - Always call get_part_labeler_schema() first to know the exact column names.
    - Filter by user_id when you want data for a specific user.
    - Add LIMIT clauses (e.g., LIMIT 100) to keep results concise.
    - Results are capped at 200 rows regardless of the query.

    Args:
        sql_query: A valid SQL SELECT statement.

    Returns:
        JSON string with keys:
            success   (bool)
            row_count (int)
            columns   (list[str])
            data      (list[dict])
        On error, returns {"success": false, "error": "<message>"}.
    """
    try:
        query = sql_query.strip()

        # ── Security check 1: block modification keywords ──────────────────
        blocked_match = _BLOCKED_PATTERN.search(query)
        if blocked_match:
            msg = (
                f"Security violation: '{blocked_match.group().strip()}' is not allowed. "
                "Only SELECT queries are permitted."
            )
            logger.warning(f"Blocked query attempt: {blocked_match.group().strip()}")
            return json.dumps({"success": False, "error": msg})

        # ── Security check 2: must start with SELECT or WITH ────────────────
        if not re.match(r"^\s*(SELECT|WITH)\b", query, re.IGNORECASE):
            return json.dumps(
                {
                    "success": False,
                    "error": (
                        "Only SELECT statements are allowed. "
                        "The query must begin with SELECT or WITH."
                    ),
                }
            )

        # ── Execute query ───────────────────────────────────────────────────
        from app.connectors.database import get_connector

        connector = get_connector()
        headers, rows = connector.execute_query_with_headers(query)

        # Convert rows → list[dict], handling non-JSON-serialisable types
        results = []
        for row in rows[:_MAX_ROWS]:
            row_dict = {}
            for col, val in zip(headers, row):
                if hasattr(val, "isoformat"):
                    row_dict[col] = val.isoformat()
                elif val is None:
                    row_dict[col] = None
                else:
                    row_dict[col] = val
            results.append(row_dict)

        total_rows = len(rows)
        logger.info(
            f"Read query returned {total_rows} rows "
            f"(returning up to {_MAX_ROWS})"
        )

        return json.dumps(
            {
                "success": True,
                "row_count": total_rows,
                "returned_rows": len(results),
                "columns": list(headers),
                "data": results,
            },
            default=str,
        )

    except Exception as e:
        logger.error(f"Error executing read query: {e}", exc_info=True)
        return json.dumps({"success": False, "error": str(e)})
