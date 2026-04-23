"""
Part Labeler Schema Tool
Fetches table schemas for the part labeler data tables from PostgreSQL
"""

import logging
import json
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# The only tables accessible to the part labeler dashboard agent
PART_LABELER_TABLES = [
    "raw_warranty_data",
    "raw_rpt_data",
    "raw_gnovac_data",
    "raw_rfi_data",
    "raw_esqa_data",
]

TABLE_DESCRIPTIONS = {
    "raw_warranty_data": "Warranty claims data – vehicle failures reported through the warranty system",
    "raw_rpt_data": "Offline RPT (Repair Process Tracking) data – in-plant defects found during manufacturing",
    "raw_gnovac_data": "GNOVAC audit data – vehicle audit findings with root-cause and corrective-action tracking",
    "raw_rfi_data": "RFI (Request for Information) data – field defect reports with severity and attribution",
    "raw_esqa_data": "e-SQA (Supplier Quality Assurance) data – supplier-side concern reports and rejection details",
}


@tool
def get_part_labeler_schema() -> str:
    """
    Get the full database schema for all Part Labeler tables.

    Returns the table names, their purpose, and every column with its
    data type and nullability for the following tables:
      - raw_warranty_data  : Warranty claims
      - raw_rpt_data       : Offline RPT defect data
      - raw_gnovac_data    : GNOVAC audit data
      - raw_rfi_data       : RFI field defect data
      - raw_esqa_data      : e-SQA supplier concern data

    Call this tool FIRST before writing any SQL query so you know the
    exact column names and types.

    Returns:
        JSON string mapping table names to their column definitions.
    """
    try:
        from app.connectors.database import get_connector

        connector = get_connector()

        schema_info = {}
        for table_name in PART_LABELER_TABLES:
            try:
                query = """
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name   = :table_name
                    ORDER BY ordinal_position
                """
                rows = connector.execute_query(query, {"table_name": table_name})
                schema_info[table_name] = {
                    "description": TABLE_DESCRIPTIONS.get(table_name, ""),
                    "columns": [
                        {
                            "column_name": row[0],
                            "data_type": row[1],
                            "nullable": row[2],
                        }
                        for row in rows
                    ],
                }
            except Exception as e:
                logger.warning(f"Could not fetch schema for {table_name}: {e}")
                schema_info[table_name] = {"error": str(e)}

        logger.info(f"Fetched schema for {len(schema_info)} part labeler tables")
        return json.dumps(schema_info, indent=2)

    except Exception as e:
        logger.error(f"Error in get_part_labeler_schema: {e}")
        return json.dumps({"error": str(e)})
