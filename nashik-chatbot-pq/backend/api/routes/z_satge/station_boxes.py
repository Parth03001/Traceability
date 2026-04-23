from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.connectors.state_db_connector import StateDBConnector
from app.connectors.database import get_connector
from app.queries import LayoutQueries, StationBoxQueries
import backend.models.schemas.z_stage_schemas as schemas

router = APIRouter(tags=["station_boxes"])


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/layouts/{layout_id}/boxes", response_model=List[schemas.StationBoxOut])
def list_boxes(
    layout_id: int,
    connector: StateDBConnector = Depends(get_connector),
):
    layout_exists = connector.execute_query(
        LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id}
    )
    if not layout_exists:
        raise HTTPException(status_code=404, detail="Layout not found")

    rows = connector.execute_query(
        StationBoxQueries.LIST_BY_LAYOUT, {"layout_id": layout_id}
    )
    return [_row_to_dict(r) for r in rows]


@router.post(
    "/layouts/{layout_id}/boxes",
    response_model=schemas.StationBoxOut,
    status_code=201,
)
def create_box(
    layout_id: int,
    payload: schemas.StationBoxCreate,
    connector: StateDBConnector = Depends(get_connector),
):
    layout_exists = connector.execute_query(
        LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id}
    )
    if not layout_exists:
        raise HTTPException(status_code=404, detail="Layout not found")

    rows = connector.execute_query(
        StationBoxQueries.CREATE_BOX,
        {
            "layout_id": layout_id,
            "name": payload.name,
            "prefix": payload.prefix,
            "station_count": payload.station_count,
            "position_x": payload.position_x,
            "position_y": payload.position_y,
            "order_index": payload.order_index,
        },
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create station box")
    return _row_to_dict(rows[0])


@router.put("/boxes/{box_id}", response_model=schemas.StationBoxOut)
def update_box(
    box_id: int,
    payload: schemas.StationBoxUpdate,
    connector: StateDBConnector = Depends(get_connector) ,
):
    exists = connector.execute_query(
        StationBoxQueries.CHECK_EXISTS, {"box_id": box_id}
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Station box not found")

    data = payload.model_dump()   # all fields, None for unset ones
    rows = connector.execute_query(
        StationBoxQueries.UPDATE_BOX,
        {
            "box_id": box_id,
            "name": data.get("name"),
            "prefix": data.get("prefix"),
            "station_count": data.get("station_count"),
            "position_x": data.get("position_x"),
            "position_y": data.get("position_y"),
            "order_index": data.get("order_index"),
        },
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to update station box")
    return _row_to_dict(rows[0])


@router.delete("/boxes/{box_id}", status_code=204)
def delete_box(
    box_id: int,
    connector: StateDBConnector = Depends(get_connector),
):
    exists = connector.execute_query(
        StationBoxQueries.CHECK_EXISTS, {"box_id": box_id}
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Station box not found")

    connector.execute_update(StationBoxQueries.DELETE_BOX, {"box_id": box_id})
