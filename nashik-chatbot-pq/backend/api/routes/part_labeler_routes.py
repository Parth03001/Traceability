"""
PartLabeler API Routes
Endpoints for CAD image labeling and warranty data
"""

import logging
import os
import shutil
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["part_labeler"])

_service = None

def get_service():
    global _service
    if _service is None:
        from backend.services.part_labeler_service import PartLabelerService
        _service = PartLabelerService()
    return _service

class LabelDto(BaseModel):
    imageId: int
    partName: str
    description: Optional[str] = ""
    partNumber: Optional[str] = ""
    failureCount: Optional[int] = 0
    reportMonth: Optional[str] = "All"
    x: float
    y: float
    userId: int

class UpdateLabelDto(BaseModel):
    partName: str
    userId: int

class MappingRequest(BaseModel):
    tempFilePath: str
    mapping: Dict[str, str]
    userId: int
    dataSource: Optional[str] = "warranty"

@router.get("/warranty-lookup")
async def warranty_lookup(
    userId: int = Query(...),
    partName: Optional[str] = Query(None),
    month: Optional[list[str]] = Query(None),
    baseModel: Optional[list[str]] = Query(None),
    misBucket: Optional[list[str]] = Query(None),
    mfgQtr: Optional[list[str]] = Query(None),
    dataSource: Optional[str] = Query("warranty"),
    buyoffStage: Optional[list[str]] = Query(None),
    onlineOffline: Optional[list[str]] = Query(None),
    defectType: Optional[list[str]] = Query(None),
):
    try:
        result = get_service().get_source_data(userId, partName, month, baseModel, misBucket, mfgQtr, dataSource, buyoffStage, onlineOffline, defectType)
        return result
    except Exception as e:
        logger.error(f"Data lookup error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch data")

@router.post("/warranty-upload")
async def upload_warranty_file(file: UploadFile = File(...)):
    """Initial upload to extract headers"""
    try:
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        
        file_path = os.path.join(temp_dir, f"{os.urandom(4).hex()}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        headers = get_service().extract_excel_headers(file_path)
        return {"tempFilePath": file_path, "headers": headers}
    except Exception as e:
        logger.error(f"Warranty upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/warranty-confirm-mapping")
async def confirm_warranty_mapping(payload: MappingRequest):
    """Process file with confirmed mapping, dispatches to correct data source"""
    try:
        count = get_service().process_data_for_source(payload.tempFilePath, payload.mapping, payload.userId, payload.dataSource)
        # Cleanup temp file
        if os.path.exists(payload.tempFilePath):
            os.remove(payload.tempFilePath)
        return {"success": True, "count": count}
    except Exception as e:
        logger.error(f"Mapping confirmation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/filter-options")
async def get_filter_options(userId: int = Query(...), dataSource: Optional[str] = Query("warranty")):
    try:
        return get_service().get_filter_options_for_source(userId, dataSource)
    except Exception as e:
        logger.error(f"Filter options error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch filter options")

@router.get("/download-warranty")
async def download_warranty(
    userId: int = Query(...),
    partName: str = Query(...),
    month: Optional[list[str]] = Query(None),
    baseModel: Optional[list[str]] = Query(None),
    misBucket: Optional[list[str]] = Query(None),
    mfgQtr: Optional[list[str]] = Query(None)
):
    from fastapi.responses import StreamingResponse
    import io
    try:
        csv_data = get_service().get_detailed_warranty_csv(userId, partName, month, baseModel, misBucket, mfgQtr)
        return StreamingResponse(
            io.StringIO(csv_data),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={partName.replace(' ', '_')}_warranty_data.csv"}
        )
    except Exception as e:
        logger.error(f"Download error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download")

@router.post("/upload")
async def upload_image(
    userId: int = Query(...),
    image: UploadFile = File(...),
    displayName: Optional[str] = Query(None)
):
    from app.config.config import get_settings
    settings = get_settings()
    try:
        # Define stable upload directory from settings
        upload_dir = settings.UPLOADS_DIRECTORY
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir, exist_ok=True)
            
        # Sanitize filename: remove spaces and problematic chars
        safe_filename = image.filename.replace(" ", "_").replace("(", "").replace(")", "")
        filename = f"{os.urandom(8).hex()}_{safe_filename}"
        file_path = os.path.join(upload_dir, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
            
        result = get_service().upload_image(filename, userId, displayName)
        return result
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")

@router.delete("/images/{image_id}")
async def delete_image(image_id: int, userId: int = Query(...)):
    try:
        get_service().delete_image(image_id, userId)
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete image error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete image")

@router.get("/images")
async def get_images(userId: int = Query(...)):
    try:
        return get_service().get_all_images(userId)
    except Exception as e:
        logger.error(f"Get images error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch images")

@router.post("/labels")
async def save_label(label: LabelDto):
    try:
        get_service().save_label(label.dict(), label.userId)
        return {"success": True}
    except Exception as e:
        logger.error(f"Save label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save label")

@router.delete("/labels/{label_id}")
async def delete_label(label_id: int, userId: int = Query(...)):
    try:
        get_service().delete_label(label_id, userId)
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete label")

@router.put("/labels/{label_id}")
async def update_label(label_id: int, payload: UpdateLabelDto):
    try:
        get_service().update_label_name(label_id, payload.partName, payload.userId)
        return {"success": True}
    except Exception as e:
        logger.error(f"Update label error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update label")

@router.get("/labels/{image_id}")
async def get_labels(image_id: int, userId: int = Query(...)):
    try:
        return get_service().get_labels_for_image(image_id, userId)
    except Exception as e:
        logger.error(f"Get labels error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch labels")

@router.get("/dashboard-data")
async def get_dashboard_data(
    userId: int = Query(...),
    partName: Optional[list[str]] = Query(None),
    month: Optional[list[str]] = Query(None),
    baseModel: Optional[list[str]] = Query(None),
    misBucket: Optional[list[str]] = Query(None),
    mfgQtr: Optional[list[str]] = Query(None),
    dataSource: Optional[str] = Query("warranty"),
    buyoffStage: Optional[list[str]] = Query(None),
    onlineOffline: Optional[list[str]] = Query(None),
    defectType: Optional[list[str]] = Query(None),
):
    try:
        return get_service().get_dashboard_data_for_source(userId, partName, month, baseModel, misBucket, mfgQtr, dataSource, buyoffStage, onlineOffline, defectType)
    except Exception as e:
        logger.error(f"Dashboard data error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard data")
