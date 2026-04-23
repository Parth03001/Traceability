import logging
import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.connectors.state_db_connector import StateDBConnector
from app.connectors.database import get_connector
from app.queries import StationDocumentQueries
import backend.models.schemas.z_stage_schemas as schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/docs", tags=["station_docs"])

DOC_TYPES = {"DDR_LO", "SOS", "PFMEA", "CONTROL_PLAN", "CCR"}

ALLOWED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/octet-stream",
}

# Uploads are stored under uploads/station_docs/
def _get_upload_dir() -> Path:
    base = Path(os.environ.get("UPLOADS_DIRECTORY", "uploads"))
    if not base.is_absolute():
        base = Path.cwd() / base
    d = base / "station_docs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=schemas.StationDocumentOut, status_code=201)
async def upload_doc(
    file: UploadFile = File(...),
    user_id: Optional[int] = Form(None),
    layout_id: Optional[int] = Form(None),
    station_id: str = Form(...),
    concern_id: Optional[str] = Form(None),
    doc_type: str = Form(...),
    connector: StateDBConnector = Depends(get_connector),
):
    if doc_type not in DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid doc_type '{doc_type}'. Must be one of: {', '.join(sorted(DOC_TYPES))}",
        )

    upload_dir = _get_upload_dir()

    # Build a unique filename to avoid collisions
    safe_station = "".join(c if c.isalnum() or c in "-_" else "_" for c in station_id)
    safe_concern = "".join(c if c.isalnum() or c in "-_" else "_" for c in (concern_id or "general"))
    original_name = file.filename or "upload"
    ext = Path(original_name).suffix
    unique_name = f"{safe_station}__{safe_concern}__{doc_type}__{original_name}"
    # Avoid path traversal
    unique_name = Path(unique_name).name

    dest = upload_dir / unique_name
    # If the exact same filename already exists for a different record keep both
    # by appending a counter
    counter = 1
    stem = dest.stem
    while dest.exists():
        dest = upload_dir / f"{stem}_{counter}{ext}"
        counter += 1

    file_bytes = await file.read()
    dest.write_bytes(file_bytes)

    rel_path = str(dest.relative_to(Path.cwd())) if dest.is_absolute() else str(dest)

    row = connector.execute_query(
        StationDocumentQueries.CREATE,
        {
            "user_id": user_id,
            "layout_id": layout_id,
            "station_id": station_id,
            "concern_id": concern_id,
            "doc_type": doc_type,
            "filename": original_name,
            "file_path": str(dest),
            "file_size": len(file_bytes),
            "mime_type": file.content_type or "application/octet-stream",
        },
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to save document record")
    return _row_to_dict(row[0])


@router.get("/list", response_model=List[schemas.StationDocumentOut])
def list_docs(
    station_id: str = Query(...),
    user_id: Optional[int] = Query(None),
    layout_id: Optional[int] = Query(None),
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(
        StationDocumentQueries.LIST_BY_STATION,
        {"user_id": user_id, "layout_id": layout_id, "station_id": station_id},
    )
    return [_row_to_dict(r) for r in rows]


@router.get("/layout-list", response_model=List[schemas.StationDocumentOut])
def list_docs_by_layout(
    user_id: Optional[int] = Query(None),
    layout_id: Optional[int] = Query(None),
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(
        StationDocumentQueries.LIST_BY_LAYOUT,
        {"user_id": user_id, "layout_id": layout_id},
    )
    return [_row_to_dict(r) for r in rows]


@router.get("/{doc_id}/download")
def download_doc(
    doc_id: int,
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(
        StationDocumentQueries.GET_BY_ID, {"doc_id": doc_id}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    doc = _row_to_dict(rows[0])
    file_path = doc.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File not found on server")
    return FileResponse(
        path=file_path,
        filename=doc["filename"],
        media_type=doc.get("mime_type") or "application/octet-stream",
    )


@router.delete("/{doc_id}", status_code=204)
def delete_doc(
    doc_id: int,
    connector: StateDBConnector = Depends(get_connector),
):
    rows = connector.execute_query(
        StationDocumentQueries.CHECK_EXISTS, {"doc_id": doc_id}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")

    # Fetch file_path to delete from disk too
    doc_rows = connector.execute_query(
        StationDocumentQueries.GET_BY_ID, {"doc_id": doc_id}
    )
    if doc_rows:
        doc = _row_to_dict(doc_rows[0])
        file_path = doc.get("file_path")
        if file_path and Path(file_path).exists():
            try:
                Path(file_path).unlink()
            except Exception as e:
                logger.warning(f"Could not delete file {file_path}: {e}")

    connector.execute_update(StationDocumentQueries.DELETE, {"doc_id": doc_id})
