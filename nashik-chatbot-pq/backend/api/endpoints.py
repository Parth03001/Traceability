"""
API Router Aggregator
Combines all route modules
"""

from fastapi import APIRouter
from backend.api.routes.conversations import conversation_routes
from backend.api.routes.health import health_routes
from backend.api.routes.auth import auth_routes
from backend.api.routes.admin.admin_routes import router as admin_router
from backend.api.routes.part_labeler_routes import router as part_labeler_router
from backend.api.routes.z_satge.layouts import router as layout_router
from backend.api.routes.z_satge.bypass_icons import router as bypass_icon_router
from backend.api.routes.z_satge.connections import router as connection_router
from backend.api.routes.z_satge.station_boxes import router as station_box_router
from backend.api.routes.z_satge.input_records import router as input_record_router
from backend.api.routes.z_satge.layered_audit import router as layered_audit_router
from backend.api.routes.z_satge.docs import router as docs_router

# Create main router
router = APIRouter()

# Include sub-routers
router.include_router(
    conversation_routes.router, prefix="/conversations", tags=["conversations"]
)

router.include_router(health_routes.router, prefix="", tags=["health"])

router.include_router(auth_routes.router, prefix="/auth", tags=["auth"])

router.include_router(admin_router, prefix="/admin", tags=["admin"])

router.include_router(part_labeler_router, prefix="/part-labeler", tags=["part_labeler"])

router.include_router(layout_router, prefix="/z-stage", tags=["z_stage_layouts"])
router.include_router(
    bypass_icon_router, prefix="/z-stage", tags=["z_stage_buyoff_icons"]
)
router.include_router(
    station_box_router, prefix="/z-stage", tags=["z_stage_station_boxes"]
)
router.include_router(connection_router, prefix="/z-stage", tags=["z_stage_connections"])
router.include_router(input_record_router, prefix="/z-stage", tags=["z_stage_input_records"])
router.include_router(layered_audit_router, prefix="/z-stage", tags=["z_stage_layered_audit"])
router.include_router(docs_router, prefix="/z-stage", tags=["z_stage_docs"])
