"""
Database Table Definitions
Defines all PostgreSQL tables for the Thar Quality Intelligence System
"""

import datetime
import logging
from sqlalchemy import (
    Table,
    MetaData,
    Column,
    Integer,
    BigInteger,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Sequence,
    Index,
    PrimaryKeyConstraint,
    ForeignKeyConstraint,
    String,
    Float,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

logger = logging.getLogger(__name__)

metadata = MetaData()
DYNAMIC_TABLES = {}


def create_dynamic_table(name, columns, constraints=None, indexes=None):
    """
    Create a dynamic SQLAlchemy table with optional constraints and indexes.

    Args:
        name (str): The name of the table to be created.
        columns (list): A list of SQLAlchemy Column objects defining the table schema.
        constraints (list, optional): A list of SQLAlchemy constraint objects.
        indexes (list, optional): A list of SQLAlchemy index objects.

    Returns:
        Table: A SQLAlchemy Table object
    """
    logger.debug(f"Creating table '{name}' with columns: {columns}")
    table_args = columns
    if constraints:
        table_args += constraints
    if indexes:
        table_args += indexes

    table = Table(name, metadata, *table_args)
    DYNAMIC_TABLES[name] = table

    logger.debug(f"Table '{name}' created and stored in DYNAMIC_TABLES.")
    return table


# Create sequences for auto-incrementing IDs
conversation_id_seq = Sequence("conversation_id_seq")
message_id_seq = Sequence("message_id_seq")
feedback_id_seq = Sequence("feedback_id_seq")
scraped_doc_id_seq = Sequence("scraped_doc_id_seq")
chunk_id_seq = Sequence("chunk_id_seq")
user_id_seq = Sequence("user_id_seq")
image_id_seq = Sequence("image_id_seq")
label_id_seq = Sequence("label_id_seq")
warranty_id_seq = Sequence("warranty_id_seq")
raw_warranty_id_seq = Sequence("raw_warranty_id_seq")
rpt_id_seq = Sequence("rpt_id_seq")
gnovac_id_seq = Sequence("gnovac_id_seq")
rfi_id_seq = Sequence("rfi_id_seq")
esqa_id_seq = Sequence("esqa_id_seq")
layout_id_seq = Sequence("layout_id_seq")
box_id_seq = Sequence("box_id_seq")
icon_id_seq = Sequence("icon_id_seq")
conn_id_seq = Sequence("conn_id_seq")



# =====================================================
# USERS TABLE (stores user accounts for login/signup)
# =====================================================
create_dynamic_table(
    "users",
    [
        Column(
            "user_id",
            BigInteger,
            user_id_seq,
            primary_key=True,
            server_default=user_id_seq.next_value(),
        ),
        Column("username", String(100), nullable=False, unique=True),
        Column("first_name", String(100), nullable=False),
        Column("last_name", String(100), nullable=False),
        Column("email", String(255), nullable=False, unique=True),
        Column("password_hash", String(255), nullable=False),
        Column("role", String(20), nullable=False, server_default="user"),
        Column(
            "created_at", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
    ],
    indexes=[
        Index("idx_users_username", "username"),
        Index("idx_users_email", "email"),
    ],
)


# =====================================================
# CHAT_SESSION TABLE (stores conversation metadata)
# =====================================================
create_dynamic_table(
    "chat_session",
    [
        Column(
            "conversation_id",
            BigInteger,
            conversation_id_seq,
            primary_key=True,
            server_default=conversation_id_seq.next_value(),
        ),
        Column("user_id", BigInteger, nullable=False),
        Column("chat_title", Text, nullable=False, default="New Chat"),
        Column("chat_summary", Text, nullable=True),
        Column(
            "creation_ts", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column("agent_type", Text, nullable=False, default="analyst"),
        Column(
            "is_deleted", Boolean, nullable=False, default=False, server_default="false"
        ),
    ],
    indexes=[
        Index("idx_chat_session_user_id", "user_id"),
        Index("idx_chat_session_creation_ts", "user_id", "creation_ts"),
        Index("idx_chat_session_agent_type", "user_id", "agent_type"),
    ],
)


# =====================================================
# CHAT_ENTRY TABLE (stores each message in a conversation)
# =====================================================
create_dynamic_table(
    "chat_entry",
    [
        Column(
            "message_id",
            BigInteger,
            message_id_seq,
            server_default=message_id_seq.next_value(),
            nullable=False,
        ),
        Column(
            "conversation_id",
            BigInteger,
            ForeignKey("chat_session.conversation_id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("query", Text, nullable=False),
        Column("response", JSONB, nullable=False),
        Column(
            "chat_entry_ts", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column("clarification_response_needed", Boolean, nullable=False, default=False),
        PrimaryKeyConstraint("conversation_id", "message_id"),
    ],
    indexes=[
        Index("idx_chat_entry_conversation_id", "conversation_id"),
    ],
)


# =====================================================
# FEEDBACK TABLE (Optional)
# =====================================================
create_dynamic_table(
    "chat_feedback",
    [
        Column(
            "feedback_id",
            BigInteger,
            feedback_id_seq,
            primary_key=True,
            server_default=feedback_id_seq.next_value(),
        ),
        Column("message_id", BigInteger, nullable=False),
        Column("conversation_id", BigInteger, nullable=False),
        Column("user_id", BigInteger, nullable=False),
        Column("feedback", Text, nullable=False),
        Column("negative_feedback_comment", Text, nullable=True),
        Column("negative_feedback_rating", Integer, nullable=True),
        Column(
            "created_at", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    constraints=[
        ForeignKeyConstraint(
            ["conversation_id", "message_id"],
            ["chat_entry.conversation_id", "chat_entry.message_id"],
            ondelete="CASCADE",
        )
    ],
    indexes=[
        Index("idx_feedback_user", "user_id"),
        Index("idx_feedback_message", "conversation_id", "message_id"),
    ],
)


# =====================================================
# SYSTEM_PROMPTS TABLE (stores agent prompts)
# =====================================================
prompt_id_seq = Sequence("prompt_id_seq")

create_dynamic_table(
    "system_prompts",
    [
        Column(
            "prompt_id",
            BigInteger,
            prompt_id_seq,
            primary_key=True,
            server_default=prompt_id_seq.next_value(),
        ),
        Column("prompt_key", String(100), nullable=False, unique=True),
        Column("prompt_name", String(255), nullable=False),
        Column("prompt_content", Text, nullable=False),
        Column(
            "created_at", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_system_prompts_key", "prompt_key"),
    ],
)


# =====================================================
# SCRAPED_DOCS TABLE (tracks documents to be processed)
# =====================================================
create_dynamic_table(
    "scraped_docs",
    [
        Column(
            "id",
            BigInteger,
            scraped_doc_id_seq,
            primary_key=True,
            server_default=scraped_doc_id_seq.next_value(),
        ),
        Column("index_name", String(255), nullable=False),
        Column("doc_name", Text, nullable=False),
        Column("doc_path", Text, nullable=False),
        Column("doc_hash", String(64), nullable=False),
        Column("status", String(20), nullable=False, default="incomplete"),
        Column(
            "created_at", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_scraped_docs_status", "status"),
        Index("idx_scraped_docs_index_name", "index_name"),
        Index("idx_scraped_docs_hash", "doc_hash"),
    ],
)


# =====================================================
# CHUNKS TABLE (stores processed document chunks)
# =====================================================
create_dynamic_table(
    "chunks",
    [
        Column(
            "chunk_id",
            BigInteger,
            chunk_id_seq,
            primary_key=True,
            server_default=chunk_id_seq.next_value(),
        ),
        Column(
            "doc_id",
            BigInteger,
            ForeignKey("scraped_docs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("index_name", String(255), nullable=False),
        Column("chunk_hash", String(64), nullable=False),
        Column("chunk_text", Text, nullable=False),
        Column("chunk_metadata", JSONB, nullable=True),
        Column("opensearch_id", String(255), nullable=True),
        Column(
            "created_at", DateTime, default=datetime.datetime.utcnow, nullable=False
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_chunks_doc_id", "doc_id"),
        Index("idx_chunks_index_name", "index_name"),
        Index("idx_chunks_hash", "chunk_hash"),
        Index("idx_chunks_opensearch_id", "opensearch_id"),
    ],
)

# =====================================================
# RAW_WARRANTY_DATA TABLE (PartLabeler)
# =====================================================
create_dynamic_table(
    "raw_warranty_data",
    [
        Column(
            "id",
            BigInteger,
            raw_warranty_id_seq,
            primary_key=True,
            server_default=raw_warranty_id_seq.next_value(),
        ),
        Column("region", Text),
        Column("zone", Text),
        Column("area_office", Text),
        Column("plant", Text),
        Column("plant_desc", Text),
        Column("commodity", Text),
        Column("group_code", Text),
        Column("group_code_desc", Text),
        Column("complaint_code", Text),
        Column("complaint_code_desc", Text),
        Column("base_model", Text),
        Column("model_code", Text),
        Column("model_family", Text),
        Column("claim_type", Text),
        Column("sap_claim_no", Text),
        Column("claim_desc", Text),
        Column("ac_non_ac", Text),
        Column("variant", Text),
        Column("drive_type", Text),
        Column("service_type", Text),
        Column("billing_dealer", Text),
        Column("billing_dealer_name", Text),
        Column("serial_no", Text),
        Column("claim_date", Text),
        Column("failure_kms", Text),
        Column("km_hr_group", Text),
        Column("dealer_verbatim", Text),
        Column("part", Text),
        Column("vender", Text),
        Column("material_description", Text),
        Column("causal_flag", Text),
        Column("jdp_city", Text),
        Column("fisyr_qrt", Text),
        Column("engine_number", Text),
        Column("manufac_yr_mon", Text),
        Column("failure_date", Text),
        Column("mis_bucket", Text),
        Column("walk_home", Text),
        Column("dealer_code", Text),
        Column("claim_dealer_name", Text),
        Column("ro_number", Text),
        Column("no_of_incidents", Text),
        Column("new_manufacturing_quater", Text),
        Column("vendor_manuf", Text),
        Column("user_id", BigInteger, nullable=True),
        Column(
            "created_at", 
            DateTime, 
            server_default=text("CURRENT_TIMESTAMP"), 
            nullable=False
        ),
    ],
    indexes=[
        Index("idx_raw_warranty_user_id", "user_id"),
        Index("idx_raw_warranty_user_month", "user_id", "manufac_yr_mon"),
        Index("idx_raw_warranty_user_model", "user_id", "base_model"),
        Index("idx_raw_warranty_user_mis", "user_id", "mis_bucket"),
        Index("idx_raw_warranty_user_qtr", "user_id", "new_manufacturing_quater"),
        Index("idx_raw_warranty_material", "material_description"),
        Index("idx_raw_warranty_failure_date", "failure_date"),
    ],
)


# =====================================================
# IMAGES TABLE (PartLabeler)
# =====================================================
create_dynamic_table(
    "images",
    [
        Column(
            "id",
            BigInteger,
            image_id_seq,
            primary_key=True,
            server_default=image_id_seq.next_value(),
        ),
        Column("filename", Text, nullable=False),
        Column("display_name", Text, nullable=True),
        Column("user_id", BigInteger, nullable=True),
        Column(
            "created_at", 
            DateTime, 
            server_default=text("CURRENT_TIMESTAMP"), 
            nullable=False
        ),
    ],
    indexes=[
        Index("idx_images_user_id", "user_id"),
    ],
)


# =====================================================
# LABELS TABLE (PartLabeler)
# =====================================================
create_dynamic_table(
    "labels",
    [
        Column(
            "id",
            BigInteger,
            label_id_seq,
            primary_key=True,
            server_default=label_id_seq.next_value(),
        ),
        Column(
            "image_id",
            BigInteger,
            ForeignKey("images.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("part_name", Text, nullable=False),
        Column("description", Text, nullable=True),
        Column("part_number", Text, nullable=True),
        Column("failure_count", Integer, default=0),
        Column("report_month", Text, nullable=True),
        Column("x_coord", Float, nullable=False),
        Column("y_coord", Float, nullable=False),
        Column("user_id", BigInteger, nullable=True),
        Column(
            "created_at", 
            DateTime, 
            server_default=text("CURRENT_TIMESTAMP"), 
            nullable=False
        ),
    ],
    indexes=[
        Index("idx_labels_image_id", "image_id"),
        Index("idx_labels_user_id", "user_id"),
    ],
)



# =====================================================
# RAW_RPT_DATA TABLE (Offline RPT - PartLabeler)
# =====================================================
create_dynamic_table(
    "raw_rpt_data",
    [
        Column("id", BigInteger, rpt_id_seq, primary_key=True, server_default=rpt_id_seq.next_value()),
        Column("date_col", Text),           # DATE column (raw)
        Column("mfg_month", Text),          # Derived: "Jan-26"
        Column("mfg_quarter", Text),        # Derived: "Jan26-Mar26"
        Column("shift", Text),              # Shift column (KMS chart)
        Column("body_sr_no", Text),         # BODYSRNO
        Column("vin_number", Text),         # VIN_Number
        Column("buyoff_stage", Text),       # Buyoff Stage
        Column("model", Text),              # Model (model filter)
        Column("platform_group", Text),     # Platform Group
        Column("stage_name", Text),         # Stage Name
        Column("part", Text),               # PART
        Column("defect", Text),             # Defect
        Column("part_defect", Text),        # PartDefect (failure search)
        Column("attribute_name", Text),     # Attribute_Name (reporting month chart)
        Column("custom_attribution", Text), # Custom Attribution
        Column("offline_val", Text),        # _Offline
        Column("online_val", Text),         # _Online
        Column("rework_status", Text),      # REWORK_STATUS
        Column("location_name", Text),      # Location_Name (location chart)
        Column("defect_status", Text),      # DEFECT_STATUS
        Column("as_is_ok", Text),           # As_Is_Ok
        Column("shop_name", Text),          # Shop_Name
        Column("model_description", Text),  # Model_Description
        Column("model_code", Text),         # ModelCode
        Column("severity_name", Text),      # Severity Name
        Column("domestic_export", Text),    # Domestic/Export
        Column("defect_category", Text),    # Defect_Category (MIS filter)
        Column("user_id", BigInteger, nullable=True),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False),
    ],
    indexes=[
        Index("idx_raw_rpt_user_id", "user_id"),
        Index("idx_raw_rpt_user_month", "user_id", "mfg_month"),
        Index("idx_raw_rpt_user_model", "user_id", "model"),
        Index("idx_raw_rpt_user_category", "user_id", "defect_category"),
        Index("idx_raw_rpt_user_qtr", "user_id", "mfg_quarter"),
    ],
)

# =====================================================
# RAW_GNOVAC_DATA TABLE (GNOVAC - PartLabeler)
# =====================================================
create_dynamic_table(
    "raw_gnovac_data",
    [
        Column("id", BigInteger, gnovac_id_seq, primary_key=True, server_default=gnovac_id_seq.next_value()),
        Column("audit_date", Text),         # Audit Date (raw)
        Column("mfg_month", Text),          # Derived: "Jan-26"
        Column("mfg_quarter", Text),        # Derived: "Jan26-Mar26"
        Column("vin_no", Text),             # VIN No
        Column("plant_name", Text),         # Plant Name
        Column("model_code", Text),         # Model Code (model filter)
        Column("variant_name", Text),       # Variant Name
        Column("fuel_type", Text),          # Fuel Type
        Column("build_phase_name", Text),   # BuildPhase Name
        Column("body_no", Text),            # Body No
        Column("part_name", Text),          # Part Name (failure search)
        Column("defect_name", Text),        # Defect Name (failure search)
        Column("location_name", Text),      # Location Name (location chart)
        Column("concern_type_name", Text),  # Concern Type Name
        Column("pointer", Text),            # Pointer (MIS filter + KMS chart)
        Column("attribution", Text),        # Attribution (reporting month chart)
        Column("four_m", Text),             # 4M
        Column("four_m_analysis_name", Text),# 4M Analysis Name
        Column("root_cause", Text),         # Root Cause
        Column("ica", Text),               # ICA
        Column("pca", Text),               # PCA
        Column("responsibility", Text),     # Responsibility
        Column("target_date", Text),        # Target Date
        Column("status", Text),            # Status
        Column("frequency", Text),          # Frequency
        Column("new_and_repeat", Text),     # New and repeat
        Column("remark", Text),             # Remark
        Column("user_id", BigInteger, nullable=True),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False),
    ],
    indexes=[
        Index("idx_raw_gnovac_user_id", "user_id"),
        Index("idx_raw_gnovac_user_month", "user_id", "mfg_month"),
        Index("idx_raw_gnovac_user_model", "user_id", "model_code"),
        Index("idx_raw_gnovac_user_pointer", "user_id", "pointer"),
        Index("idx_raw_gnovac_user_qtr", "user_id", "mfg_quarter"),
    ],
)

# =====================================================
# RAW_RFI_DATA TABLE (RFI - PartLabeler)
# =====================================================
create_dynamic_table(
    "raw_rfi_data",
    [
        Column("id", BigInteger, rfi_id_seq, primary_key=True, server_default=rfi_id_seq.next_value()),
        Column("date_col", Text),           # Date (raw)
        Column("mfg_month", Text),          # Derived: "Jan-26"
        Column("mfg_quarter", Text),        # Derived: "Jan26-Mar26"
        Column("plant_name", Text),         # Plant Name
        Column("vin_no", Text),             # Vin No
        Column("biw_no", Text),             # BIW No
        Column("model_name", Text),         # Model Name (model filter)
        Column("variant", Text),            # Variant
        Column("fuel", Text),              # Fuel
        Column("drive_name", Text),         # Drive Name
        Column("build_phase_name", Text),   # Build Phase Name
        Column("software_v_name", Text),    # SoftwareV Name
        Column("color_name", Text),         # Color Name
        Column("country_name", Text),       # Country Name
        Column("area_name", Text),          # Area Name (location chart)
        Column("part_name", Text),          # Part Name (failure search)
        Column("defect_name", Text),        # Defect Name (failure search)
        Column("location_name", Text),      # Location Name
        Column("defect_type_name", Text),   # DefectType Name (KMS joint chart)
        Column("severity_name", Text),      # Severity Name (MIS filter + KMS chart)
        Column("attribution_name", Text),   # Attribution Name (reporting month)
        Column("stage_name", Text),         # Stage Name
        Column("root_cause", Text),         # Root Cause
        Column("ica", Text),               # ICA
        Column("pca", Text),               # PCA
        Column("target_date", Text),        # Target Date
        Column("responsibility", Text),     # Responsibility
        Column("status", Text),            # Status
        Column("category_name", Text),      # Category Name
        Column("analysis_name", Text),      # Analysis Name
        Column("action_plan_status", Text), # Action plan status
        Column("frequency", Text),          # Frequency
        Column("user_id", BigInteger, nullable=True),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False),
    ],
    indexes=[
        Index("idx_raw_rfi_user_id", "user_id"),
        Index("idx_raw_rfi_user_month", "user_id", "mfg_month"),
        Index("idx_raw_rfi_user_model", "user_id", "model_name"),
        Index("idx_raw_rfi_user_severity", "user_id", "severity_name"),
        Index("idx_raw_rfi_user_qtr", "user_id", "mfg_quarter"),
    ],
)

# =====================================================
# RAW_ESQA_DATA TABLE (e-SQA - PartLabeler)
# =====================================================
create_dynamic_table(
    "raw_esqa_data",
    [
        Column("id", BigInteger, esqa_id_seq, primary_key=True, server_default=esqa_id_seq.next_value()),
        Column("concern_report_date", Text),  # Concern Report Date (raw)
        Column("mfg_month", Text),            # Derived: "Jan-26"
        Column("mfg_quarter", Text),          # Derived: "Jan26-Mar26"
        Column("concern_number", Text),       # Concern Number
        Column("pu_name", Text),              # Pu Name
        Column("concern_source", Text),       # Concern Source (KMS chart)
        Column("part_no", Text),              # Part No
        Column("part_name", Text),            # Part Name (failure search)
        Column("vendor_code", Text),          # Vendor Code
        Column("vendor_name", Text),          # Vendor Name
        Column("concern_description", Text),  # Concern Description (failure search)
        Column("vehicle_model", Text),        # Vehicle Model (model filter)
        Column("vehicle_variant", Text),      # Vehicle Variant
        Column("concern_repeat", Text),       # Concern Repeat
        Column("concern_category", Text),     # Concern Catergory (MIS filter)
        Column("concern_severity", Text),     # Concern Severity (location chart)
        Column("qty_reported", Text),         # Qty. Reported
        Column("commodity", Text),            # Commodity (reporting month chart)
        Column("concern_attribution", Text),  # Concern Attribution
        Column("initial_analysis", Text),     # Initial Analysis
        Column("sqa_officer", Text),          # SQA Officer
        Column("ica_possible", Text),         # ICA Possible
        Column("reason_ica_not_possible", Text), # Reason for ICA Not Possible
        Column("ica_details", Text),          # ICA Details at M&M
        Column("ica_failure", Text),          # ICA Failure
        Column("segregation_qty", Text),      # Segregation Qty
        Column("ok_qty", Text),              # OK Qty
        Column("rejection_qty", Text),        # Rejection Qty
        Column("scrap_qty", Text),            # Scrap Qty
        Column("rework_qty", Text),           # Rework Qty
        Column("deviation_qty", Text),        # Deviation Qty
        Column("line_loss", Text),            # Line Loss
        Column("yard_hold", Text),            # Yard Hold
        Column("esqa_entry_required", Text),  # ESQA Entry Required
        Column("justification_esqa", Text),   # Justification for ESQA Not Required
        Column("esqa_number", Text),          # ESQA Number
        Column("esqa_posting_date", Text),    # ESQA Posting Date
        Column("user_id", BigInteger, nullable=True),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False),
    ],
    indexes=[
        Index("idx_raw_esqa_user_id", "user_id"),
        Index("idx_raw_esqa_user_month", "user_id", "mfg_month"),
        Index("idx_raw_esqa_user_model", "user_id", "vehicle_model"),
        Index("idx_raw_esqa_user_category", "user_id", "concern_category"),
        Index("idx_raw_esqa_user_qtr", "user_id", "mfg_quarter"),
    ],
)

logger.info("All table definitions created successfully")



# ── layouts ───────────────────────────────────────────────────────────────────

create_dynamic_table(
    "layouts",
    [
        Column(
            "id",
            Integer,
            layout_id_seq,
            primary_key=True,
            server_default=layout_id_seq.next_value(),
        ),
        Column("name", String(255), nullable=False),
        Column("user_id", Integer, nullable=True),
        Column("legend_position_x", Float, nullable=True),
        Column("legend_position_y", Float, nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_layouts_created_at", "created_at"),
    ],
)


# ── station_boxes ─────────────────────────────────────────────────────────────

create_dynamic_table(
    "station_boxes",
    [
        Column(
            "id",
            Integer,
            box_id_seq,
            primary_key=True,
            server_default=box_id_seq.next_value(),
        ),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("name", String(255), nullable=False),
        Column("prefix", String(50), nullable=False),
        Column("station_count", Integer, nullable=False),
        Column("station_ids", String, nullable=True),
        Column("z_labels", String, nullable=True),
        Column("station_data", String, nullable=True),
        Column("position_x", Float, nullable=False, default=0.0),
        Column("position_y", Float, nullable=False, default=0.0),
        Column("order_index", Integer, nullable=False, default=0),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_station_boxes_layout_id", "layout_id"),
        Index("idx_station_boxes_order", "layout_id", "order_index"),
    ],
)


# ── buyoff_icons ──────────────────────────────────────────────────────────────

create_dynamic_table(
    "buyoff_icons",
    [
        Column(
            "id",
            Integer,
            icon_id_seq,
            primary_key=True,
            server_default=icon_id_seq.next_value(),
        ),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("position_x", Float, nullable=False, default=0.0),
        Column("position_y", Float, nullable=False, default=0.0),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_buyoff_icons_layout_id", "layout_id"),
    ],
)


# ── box_connections ───────────────────────────────────────────────────────────

create_dynamic_table(
    "box_connections",
    [
        Column(
            "id",
            Integer,
            conn_id_seq,
            primary_key=True,
            server_default=conn_id_seq.next_value(),
        ),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column(
            "from_box_id",
            Integer,
            ForeignKey("station_boxes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        Column(
            "to_box_id",
            Integer,
            ForeignKey("station_boxes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        Column(
            "from_buyoff_id",
            Integer,
            ForeignKey("buyoff_icons.id", ondelete="CASCADE"),
            nullable=True,
        ),
        Column(
            "to_buyoff_id",
            Integer,
            ForeignKey("buyoff_icons.id", ondelete="CASCADE"),
            nullable=True,
        ),
        Column("from_station_id", String(50), nullable=True),
        Column("to_station_id", String(50), nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_box_connections_layout_id", "layout_id"),
        Index("idx_box_connections_from", "from_box_id"),
        Index("idx_box_connections_to", "to_box_id"),
        Index("idx_box_connections_from_buyoff", "from_buyoff_id"),
        Index("idx_box_connections_to_buyoff", "to_buyoff_id"),
    ],
)


layered_audit_id_seq = Sequence("layered_audit_id_seq")
layered_audit_adherence_id_seq = Sequence("layered_audit_adherence_id_seq")

# ── layered_audit ─────────────────────────────────────────────────────────────

create_dynamic_table(
    "layered_audit",
    [
        Column(
            "id",
            Integer,
            layered_audit_id_seq,
            primary_key=True,
            server_default=layered_audit_id_seq.next_value(),
        ),
        Column("user_id", Integer, nullable=True),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        Column("model", String(255), nullable=True),
        Column("sr_no", String(255), nullable=True),
        Column("date_col", String(50), nullable=True),
        Column("station_id", String(100), nullable=True),
        Column("workstation", String(255), nullable=True),
        Column("auditor", String(255), nullable=True),
        Column("ncs", String, nullable=True),
        Column("action_plan", String, nullable=True),
        Column("four_m", String(100), nullable=True),
        Column("responsibility", String(255), nullable=True),
        Column("target_date", String(50), nullable=True),
        Column("status", String(50), nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_layered_audit_station_id", "station_id"),
        Index("idx_layered_audit_layout_id", "layout_id"),
    ],
)


# ── layered_audit_adherence ───────────────────────────────────────────────────

create_dynamic_table(
    "layered_audit_adherence",
    [
        Column(
            "id",
            Integer,
            layered_audit_adherence_id_seq,
            primary_key=True,
            server_default=layered_audit_adherence_id_seq.next_value(),
        ),
        Column("user_id", Integer, nullable=True),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        Column("stage_no", String(100), nullable=True),
        Column("stage_name", String(255), nullable=True),
        Column("auditor", String(255), nullable=True),
        Column("audit_date", String(50), nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_layered_audit_adherence_stage_no", "stage_no"),
        Index("idx_layered_audit_adherence_layout_id", "layout_id"),
    ],
)

input_record_id_seq = Sequence("input_record_id_seq")

create_dynamic_table(
    "input_records",
    [
        Column(
            "id",
            Integer,
            input_record_id_seq,
            primary_key=True,
            server_default=input_record_id_seq.next_value(),
        ),
        Column("user_id", Integer, nullable=True),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        Column("sr_no", Integer, nullable=True),
        Column("concern_id", String(255), nullable=True),
        Column("concern", String, nullable=True),
        Column("type", String(50), nullable=True),
        Column("root_cause", String, nullable=True),
        Column("action_plan", String, nullable=True),
        Column("target_date", String(50), nullable=True),
        Column("closure_date", String(50), nullable=True),
        Column("ryg", String(10), nullable=True),
        Column("attri", String(255), nullable=True),
        Column("comm", String, nullable=True),
        Column("line", String(255), nullable=True),
        Column("stage_no", String(50), nullable=True),
        Column("z_e", String(10), nullable=True),
        Column("attribution", String(10), nullable=True),
        Column("part", String(255), nullable=True),
        Column("phenomena", String(255), nullable=True),
        Column("total_incidences", Integer, nullable=True),
        Column("monthly_data", String, nullable=True),
        Column("field_defect_after_cutoff", Integer, nullable=True),
        Column("status_3m", String(10), nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_input_records_stage_no", "stage_no"),
    ],
)


station_document_id_seq = Sequence("station_document_id_seq")

create_dynamic_table(
    "station_documents",
    [
        Column(
            "id",
            Integer,
            station_document_id_seq,
            primary_key=True,
            server_default=station_document_id_seq.next_value(),
        ),
        Column("user_id", Integer, nullable=True),
        Column(
            "layout_id",
            Integer,
            ForeignKey("layouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        Column("station_id", String(100), nullable=False),
        Column("concern_id", String(255), nullable=True),
        Column("doc_type", String(50), nullable=False),  # DDR_LO / SOS / PFMEA / CONTROL_PLAN / CCR
        Column("filename", String(500), nullable=False),
        Column("file_path", String(1000), nullable=True),
        Column("file_size", Integer, nullable=True),
        Column("mime_type", String(100), nullable=True),
        Column(
            "created_at",
            DateTime,
            default=datetime.datetime.utcnow,
            nullable=False,
        ),
        Column(
            "updated_at",
            DateTime,
            default=datetime.datetime.utcnow,
            onupdate=datetime.datetime.utcnow,
            nullable=False,
        ),
    ],
    indexes=[
        Index("idx_station_docs_station_id", "station_id"),
        Index("idx_station_docs_layout_id", "layout_id"),
        Index("idx_station_docs_concern_id", "concern_id"),
    ],
)


logger.info("All Z-Stage table definitions registered")
