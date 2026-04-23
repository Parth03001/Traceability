from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.connectors.state_db_connector import StateDBConnector
from app.connectors.database import get_connector
from app.queries import LayoutQueries, ConnectionQueries
import backend.models.schemas.z_stage_schemas as schemas

router = APIRouter(tags=["connections"])


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


@router.get("/layouts/{layout_id}/connections", response_model=List[schemas.ConnectionOut])
def list_connections(layout_id: int, connector: StateDBConnector = Depends(get_connector)):
    layout_exists = connector.execute_query(LayoutQueries.CHECK_EXISTS, {"layout_id": layout_id})
    if not layout_exists:
        raise HTTPException(status_code=404, detail="Layout not found")
    rows = connector.execute_query(ConnectionQueries.LIST_BY_LAYOUT, {"layout_id": layout_id})
    return [_row_to_dict(r) for r in rows]


@router.delete("/connections/{conn_id}", status_code=204)
def delete_connection(conn_id: int, connector: StateDBConnector = Depends(get_connector)):
    exists = connector.execute_query(ConnectionQueries.CHECK_EXISTS, {"conn_id": conn_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Connection not found")
    connector.execute_update(ConnectionQueries.DELETE_CONNECTION, {"conn_id": conn_id})
