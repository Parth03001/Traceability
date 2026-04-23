import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from typing import List, Optional

from app.connectors.state_db_connector import StateDBConnector
from app.connectors.database import get_connector
from app.queries import (
    LayoutQueries, StationBoxQueries, BuyoffIconQueries,
    ConnectionQueries, SnapshotQueries,
)
import backend.models.schemas.z_stage_schemas as schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/layouts", tags=["layouts"])


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


def _build_layout_out(layout_row, connector: StateDBConnector) -> dict:
    """Assemble full LayoutOut dict including nested boxes, icons and connections"""
    layout = _row_to_dict(layout_row)
    lid = layout["id"]

    boxes = connector.execute_query(StationBoxQueries.LIST_BY_LAYOUT, {"layout_id": lid})
    icons = connector.execute_query(BuyoffIconQueries.LIST_BY_LAYOUT, {"layout_id": lid})
    conns = connector.execute_query(ConnectionQueries.LIST_BY_LAYOUT, {"layout_id": lid})

    layout["station_boxes"] = [_row_to_dict(b) for b in boxes]
    layout["buyoff_icons"] = [_row_to_dict(i) for i in icons]
    layout["connections"] = [_row_to_dict(c) for c in conns]
    return layout


# ── Standard CRUD ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.LayoutSummary])
def list_layouts(
    user_id: Optional[int] = Query(None),
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(LayoutQueries.LIST_LAYOUTS, {"user_id": user_id})
    return [_row_to_dict(r) for r in rows]


@router.post("/", response_model=schemas.LayoutOut, status_code=201)
def create_layout(
    payload: schemas.LayoutCreate,
    user_id: Optional[int] = Query(None),
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(LayoutQueries.CREATE_LAYOUT, {"name": payload.name, "user_id": user_id})
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create layout")
    return _build_layout_out(rows[0], connector)


@router.get("/{layout_id}", response_model=schemas.LayoutOut)
def get_layout(layout_id: int, connector: StateDBConnector = Depends(get_connector)):
    rows = connector.execute_query(LayoutQueries.GET_LAYOUT, {"layout_id": layout_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Layout not found")
    return _build_layout_out(rows[0], connector)


@router.put("/{layout_id}", response_model=schemas.LayoutOut)
def update_layout(layout_id: int, payload: schemas.LayoutUpdate, connector: StateDBConnector = Depends(get_connector)):
    exists = connector.execute_query(LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Layout not found")
    rows = connector.execute_query(LayoutQueries.UPDATE_LAYOUT, {
        "layout_id": layout_id,
        "name": payload.name,
        "legend_position_x": payload.legend_position_x,
        "legend_position_y": payload.legend_position_y,
        "text_labels": payload.text_labels,
        "canvas_arrows": payload.canvas_arrows,
    })
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to update layout")
    return _build_layout_out(rows[0], connector)


@router.delete("/{layout_id}", status_code=204)
def delete_layout(layout_id: int, connector: StateDBConnector = Depends(get_connector)):
    exists = connector.execute_query(LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Layout not found")
    connector.execute_update(LayoutQueries.DELETE_LAYOUT, {"layout_id": layout_id})


# ── Snapshot (full save / update in one transaction) ─────────────────────────

def _execute_snapshot(layout_id: int, payload: schemas.LayoutSnapshotCreate, connector: StateDBConnector) -> dict:
    """
    Core snapshot logic used by both POST and PUT snapshot endpoints.
    Runs in a single session/transaction:
      1. Wipe existing children
      2. Re-insert boxes  → build local_id → db_id map
      3. Re-insert buyoff icons
      4. Re-insert connections (resolved via map)
    Returns the assembled LayoutOut dict.
    """
    box_map: dict = {}      # local_id → db box id
    buyoff_map: dict = {}   # local_id → db buyoff icon id

    with connector.get_session() as session:
        # 1. Clear existing children
        session.execute(text(SnapshotQueries.DELETE_CONNECTIONS), {"layout_id": layout_id})
        session.execute(text(SnapshotQueries.DELETE_BUYOFF_ICONS), {"layout_id": layout_id})
        session.execute(text(SnapshotQueries.DELETE_STATION_BOXES), {"layout_id": layout_id})

        # 2. Update layout name, legend position, text labels and canvas arrows
        session.execute(
            text(LayoutQueries.UPDATE_LAYOUT),
            {
                "layout_id": layout_id,
                "name": payload.name,
                "legend_position_x": payload.legend_position_x,
                "legend_position_y": payload.legend_position_y,
                "text_labels": payload.text_labels or "[]",
                "canvas_arrows": payload.canvas_arrows or "[]",
            },
        )

        # 3. Insert boxes
        for box in payload.boxes:
            result = session.execute(
                text(StationBoxQueries.CREATE_BOX),
                {
                    "layout_id": layout_id,
                    "name": box.name,
                    "prefix": box.prefix,
                    "station_count": box.station_count,
                    "station_ids": box.station_ids,
                    "z_labels": box.z_labels,
                    "station_data": box.station_data,
                    "position_x": box.position_x,
                    "position_y": box.position_y,
                    "order_index": box.order_index,
                },
            )
            row = result.fetchone()
            if row:
                box_map[box.local_id] = row[0]  # db id (first RETURNING column)

        # 4. Insert buyoff icons
        for icon in payload.buyoff_icons:
            result = session.execute(
                text(BuyoffIconQueries.CREATE_ICON),
                {
                    "layout_id": layout_id,
                    "position_x": icon.position_x,
                    "position_y": icon.position_y,
                    "name": icon.name or "",
                },
            )
            row = result.fetchone()
            if row:
                buyoff_map[icon.local_id] = row[0]

        # 5. Insert connections — resolve each endpoint from box_map or buyoff_map
        #    Local IDs for station-level connections use "__" as separator:
        #    e.g. "loc-1__T1-01" → box local_id="loc-1", station_id="T1-01"
        for conn in payload.connections:
            from_local = conn.from_local_id
            from_station_id = None
            if '__' in from_local:
                parts = from_local.split('__', 1)
                from_local, from_station_id = parts[0], parts[1]

            to_local = conn.to_local_id
            to_station_id = None
            if '__' in to_local:
                parts = to_local.split('__', 1)
                to_local, to_station_id = parts[0], parts[1]

            from_box    = box_map.get(from_local)
            from_buyoff = None if from_box else buyoff_map.get(from_local)
            to_box      = box_map.get(to_local)
            to_buyoff   = None if to_box else buyoff_map.get(to_local)

            # Both endpoints must resolve to something
            if (from_box or from_buyoff) and (to_box or to_buyoff):
                session.execute(
                    text(ConnectionQueries.CREATE_CONNECTION),
                    {
                        "layout_id":      layout_id,
                        "from_box_id":    from_box,
                        "to_box_id":      to_box,
                        "from_buyoff_id": from_buyoff,
                        "to_buyoff_id":   to_buyoff,
                        "from_station_id": from_station_id,
                        "to_station_id":   to_station_id,
                    },
                )

    # Fetch and return the full updated layout
    rows = connector.execute_query(LayoutQueries.GET_LAYOUT, {"layout_id": layout_id})
    return _build_layout_out(rows[0], connector)


@router.post("/snapshot", response_model=schemas.LayoutOut, status_code=201)
def create_snapshot(
    payload: schemas.LayoutSnapshotCreate,
    user_id: Optional[int] = Query(None),
    connector: StateDBConnector = Depends(get_connector),
):
    """Create a new layout from a full canvas snapshot"""
    layout_rows = connector.execute_query(LayoutQueries.CREATE_LAYOUT, {"name": payload.name, "user_id": user_id})
    if not layout_rows:
        raise HTTPException(status_code=500, detail="Failed to create layout")
    layout_id = _row_to_dict(layout_rows[0])["id"]
    return _execute_snapshot(layout_id, payload, connector)


@router.put("/{layout_id}/snapshot", response_model=schemas.LayoutOut)
def update_snapshot(layout_id: int, payload: schemas.LayoutSnapshotCreate, connector: StateDBConnector = Depends(get_connector)):
    """Replace an existing layout's full canvas state atomically"""
    exists = connector.execute_query(LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Layout not found")
    return _execute_snapshot(layout_id, payload, connector)
