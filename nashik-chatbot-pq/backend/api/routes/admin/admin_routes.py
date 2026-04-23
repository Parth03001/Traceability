"""
Admin API Routes
User management endpoints — only accessible by users with role='admin'.
Authorization: caller must pass their user_id as query param; backend verifies admin role.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from backend.models.schemas.auth_schemas import UpdateRoleDto, CreateUserDto

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])

ALLOWED_ROLES = {"admin", "user", "part_labeler", "part_labeler_field", "part_labeler_plant"}

_auth_service = None


def get_db():
    from app.connectors.state_db_connector import StateDBConnector
    return StateDBConnector()


def get_auth_service():
    global _auth_service
    if _auth_service is None:
        from backend.services.auth.auth_service import AuthService
        _auth_service = AuthService()
    return _auth_service


def require_admin(requester_id: int):
    """
    Raises HTTPException 403 if the requesting user is not an admin.
    """
    from app.queries.auth_queries import AuthQueries
    db = get_db()
    rows = db.execute_query(AuthQueries.GET_USER_ROLE, {"user_id": requester_id})
    if not rows or rows[0][0] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/users")
async def list_users(requester_id: int = Query(..., description="user_id of the admin making the request")):
    """List all users — admin only"""
    require_admin(requester_id)
    from app.queries.auth_queries import AuthQueries
    db = get_db()
    rows = db.execute_query(AuthQueries.GET_ALL_USERS, {})
    users = [
        {
            "user_id": row[0],
            "username": row[1],
            "first_name": row[2],
            "last_name": row[3],
            "email": row[4],
            "role": row[5],
            "created_at": str(row[6]),
        }
        for row in rows
    ]
    return JSONResponse(content={"users": users})


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    requester_id: int = Query(..., description="user_id of the admin making the request"),
):
    """Delete a user — admin only. Admin cannot delete themselves."""
    require_admin(requester_id)
    if user_id == requester_id:
        raise HTTPException(status_code=400, detail="Admin cannot delete their own account")
    from app.queries.auth_queries import AuthQueries
    db = get_db()
    db.execute_update(AuthQueries.DELETE_USER, {"user_id": user_id})
    logger.info(f"User {user_id} deleted by admin {requester_id}")
    return JSONResponse(content={"message": "User deleted successfully"})


@router.post("/users")
async def create_user(
    payload: CreateUserDto,
    requester_id: int = Query(..., description="user_id of the admin making the request"),
):
    """Create a new user with a specified role — admin only."""
    import hashlib
    from datetime import datetime, timezone
    require_admin(requester_id)
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{payload.role}'. Allowed: {', '.join(ALLOWED_ROLES)}",
        )
    from app.queries.auth_queries import AuthQueries
    db = get_db()
    # Check username uniqueness
    existing = db.execute_query(AuthQueries.CHECK_USERNAME_EXISTS, {"username": payload.username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    # Check email uniqueness
    existing_email = db.execute_query(AuthQueries.CHECK_EMAIL_EXISTS, {"email": payload.email})
    if existing_email:
        raise HTTPException(status_code=409, detail="Email already registered")
    password_hash = hashlib.sha256(payload.password.encode()).hexdigest()
    rows = db.execute_query(
        AuthQueries.REGISTER_USER,
        {
            "username": payload.username,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "email": payload.email,
            "password_hash": password_hash,
            "role": payload.role,
            "created_at": datetime.now(timezone.utc),
        },
    )
    new_user_id = rows[0][0] if rows else None
    logger.info(f"User '{payload.username}' (role={payload.role}) created by admin {requester_id}")
    return JSONResponse(
        status_code=201,
        content={"message": "User created successfully", "user_id": new_user_id},
    )


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    payload: UpdateRoleDto,
    requester_id: int = Query(..., description="user_id of the admin making the request"),
):
    """Update a user's role — admin only."""
    require_admin(requester_id)
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{payload.role}'. Allowed: {', '.join(ALLOWED_ROLES)}",
        )
    if user_id == requester_id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Admin cannot demote their own account")
    from app.queries.auth_queries import AuthQueries
    db = get_db()
    db.execute_update(AuthQueries.UPDATE_USER_ROLE, {"user_id": user_id, "role": payload.role})
    logger.info(f"User {user_id} role updated to '{payload.role}' by admin {requester_id}")
    return JSONResponse(content={"message": f"Role updated to '{payload.role}'"})
