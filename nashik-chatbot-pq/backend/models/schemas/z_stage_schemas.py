from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


# ── StationBox ───────────────────────────────────────────────────────────────

class StationBoxBase(BaseModel):
    name: str
    prefix: str
    station_count: int
    station_ids: Optional[str] = None
    z_labels: Optional[str] = None
    station_data: Optional[str] = None
    position_x: float = 0.0
    position_y: float = 0.0
    order_index: int = 0


class StationBoxCreate(StationBoxBase):
    pass


class StationBoxUpdate(BaseModel):
    name: Optional[str] = None
    prefix: Optional[str] = None
    station_count: Optional[int] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    order_index: Optional[int] = None


class StationBoxOut(StationBoxBase):
    id: int
    layout_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── BuyoffIcon ───────────────────────────────────────────────────────────────

class BuyoffIconBase(BaseModel):
    position_x: float = 0.0
    position_y: float = 0.0
    name: Optional[str] = ""


class BuyoffIconCreate(BuyoffIconBase):
    pass


class BuyoffIconUpdate(BaseModel):
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    name: Optional[str] = None


class BuyoffIconOut(BuyoffIconBase):
    id: int
    layout_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Backward-compat aliases (keep old names working during transition)
BypassIconBase   = BuyoffIconBase
BypassIconCreate = BuyoffIconCreate
BypassIconUpdate = BuyoffIconUpdate
BypassIconOut    = BuyoffIconOut


# ── Connection ────────────────────────────────────────────────────────────────

class ConnectionOut(BaseModel):
    id: int
    layout_id: int
    from_box_id: Optional[int] = None
    to_box_id: Optional[int] = None
    from_buyoff_id: Optional[int] = None
    to_buyoff_id: Optional[int] = None
    from_station_id: Optional[str] = None
    to_station_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Layout ────────────────────────────────────────────────────────────────────

class LayoutBase(BaseModel):
    name: str


class LayoutCreate(LayoutBase):
    pass


class LayoutUpdate(BaseModel):
    name: Optional[str] = None
    legend_position_x: Optional[float] = None
    legend_position_y: Optional[float] = None
    text_labels: Optional[str] = None
    canvas_arrows: Optional[str] = None


class LayoutOut(LayoutBase):
    id: int
    user_id: Optional[int] = None
    legend_position_x: Optional[float] = None
    legend_position_y: Optional[float] = None
    text_labels: Optional[str] = "[]"
    canvas_arrows: Optional[str] = "[]"
    created_at: datetime
    updated_at: datetime
    station_boxes: List[StationBoxOut] = []
    buyoff_icons: List[BuyoffIconOut] = []
    connections: List[ConnectionOut] = []

    model_config = {"from_attributes": True}


class LayoutSummary(LayoutBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Snapshot (full layout save) ───────────────────────────────────────────────

class SnapshotBox(BaseModel):
    local_id: str
    name: str
    prefix: str
    station_count: int
    station_ids: Optional[str] = None
    z_labels: Optional[str] = None
    station_data: Optional[str] = None
    position_x: float = 0.0
    position_y: float = 0.0
    order_index: int = 0


class SnapshotBuyoffIcon(BaseModel):
    local_id: str
    position_x: float = 0.0
    position_y: float = 0.0
    name: Optional[str] = ""


# Backward-compat alias
SnapshotBypassIcon = SnapshotBuyoffIcon


class SnapshotConnection(BaseModel):
    from_local_id: str
    to_local_id: str
    from_station_id: Optional[str] = None
    to_station_id: Optional[str] = None


class LayoutSnapshotCreate(BaseModel):
    name: str
    legend_position_x: Optional[float] = None
    legend_position_y: Optional[float] = None
    text_labels: Optional[str] = "[]"
    canvas_arrows: Optional[str] = "[]"
    boxes: List[SnapshotBox] = []
    buyoff_icons: List[SnapshotBuyoffIcon] = []
    connections: List[SnapshotConnection] = []


# ── InputRecord ───────────────────────────────────────────────────────────────

class InputRecordOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    layout_id: Optional[int] = None
    sr_no: Optional[int] = None
    concern_id: Optional[str] = None
    concern: Optional[str] = None
    type: Optional[str] = None
    root_cause: Optional[str] = None
    action_plan: Optional[str] = None
    target_date: Optional[str] = None
    closure_date: Optional[str] = None
    ryg: Optional[str] = None
    attri: Optional[str] = None
    comm: Optional[str] = None
    line: Optional[str] = None
    stage_no: Optional[str] = None
    z_e: Optional[str] = None
    attribution: Optional[str] = None
    part: Optional[str] = None
    phenomena: Optional[str] = None
    total_incidences: Optional[int] = None
    monthly_data: Optional[str] = None
    field_defect_after_cutoff: Optional[int] = None
    status_3m: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InputRecordUpdate(BaseModel):
    layout_id: Optional[int] = None
    sr_no: Optional[int] = None
    concern_id: Optional[str] = None
    concern: Optional[str] = None
    type: Optional[str] = None
    root_cause: Optional[str] = None
    action_plan: Optional[str] = None
    target_date: Optional[str] = None
    closure_date: Optional[str] = None
    ryg: Optional[str] = None
    attri: Optional[str] = None
    comm: Optional[str] = None
    line: Optional[str] = None
    stage_no: Optional[str] = None
    z_e: Optional[str] = None
    attribution: Optional[str] = None
    part: Optional[str] = None
    phenomena: Optional[str] = None
    total_incidences: Optional[int] = None
    monthly_data: Optional[str] = None
    field_defect_after_cutoff: Optional[int] = None
    status_3m: Optional[str] = None


class SkippedRow(BaseModel):
    row_number: int
    reason: str


class UploadResponse(BaseModel):
    message: str
    rows_imported: int
    skipped_rows: Optional[List[SkippedRow]] = None


# ── LayeredAudit update payload ───────────────────────────────────────────────

class LayeredAuditUpdate(BaseModel):
    model: Optional[str] = None
    sr_no: Optional[str] = None
    date_col: Optional[str] = None
    station_id: Optional[str] = None
    workstation: Optional[str] = None
    auditor: Optional[str] = None
    ncs: Optional[str] = None
    action_plan: Optional[str] = None
    four_m: Optional[str] = None
    responsibility: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = None


# ── LayeredAuditAdherence update payload ─────────────────────────────────────

class LayeredAuditAdherenceUpdate(BaseModel):
    stage_no: Optional[str] = None
    stage_name: Optional[str] = None
    auditor: Optional[str] = None
    audit_date: Optional[str] = None


# ── LayeredAudit ──────────────────────────────────────────────────────────────

class LayeredAuditOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    layout_id: Optional[int] = None
    model: Optional[str] = None
    sr_no: Optional[str] = None
    date_col: Optional[str] = None
    station_id: Optional[str] = None
    workstation: Optional[str] = None
    auditor: Optional[str] = None
    ncs: Optional[str] = None
    action_plan: Optional[str] = None
    four_m: Optional[str] = None
    responsibility: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── LayeredAuditAdherence ──────────────��─────────────────────────────��────────

class LayeredAuditAdherenceOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    layout_id: Optional[int] = None
    stage_no: Optional[str] = None
    stage_name: Optional[str] = None
    auditor: Optional[str] = None
    audit_date: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Single-record create payloads ──��──────────────────────────────────────────

class InputRecordCreate(BaseModel):
    sr_no: Optional[int] = None
    concern_id: Optional[str] = None
    concern: Optional[str] = None
    type: Optional[str] = None
    root_cause: Optional[str] = None
    action_plan: Optional[str] = None
    target_date: Optional[str] = None
    closure_date: Optional[str] = None
    ryg: Optional[str] = None
    attri: Optional[str] = None
    comm: Optional[str] = None
    line: Optional[str] = None
    stage_no: Optional[str] = None
    z_e: Optional[str] = None
    attribution: Optional[str] = None
    part: Optional[str] = None
    phenomena: Optional[str] = None
    total_incidences: Optional[int] = None
    monthly_data: Optional[str] = None
    field_defect_after_cutoff: Optional[int] = None
    status_3m: Optional[str] = None


class LayeredAuditCreate(BaseModel):
    model: Optional[str] = None
    sr_no: Optional[str] = None
    date_col: Optional[str] = None
    station_id: Optional[str] = None
    workstation: Optional[str] = None
    auditor: Optional[str] = None
    ncs: Optional[str] = None
    action_plan: Optional[str] = None
    four_m: Optional[str] = None
    responsibility: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = None


class LayeredAuditAdherenceCreate(BaseModel):
    stage_no: Optional[str] = None
    stage_name: Optional[str] = None
    auditor: Optional[str] = None
    audit_date: Optional[str] = None


# ── StationDocument ───────────────────────────────────────────────────────────

class StationDocumentOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    layout_id: Optional[int] = None
    station_id: str
    concern_id: Optional[str] = None
    doc_type: str
    filename: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
