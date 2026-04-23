"""
Pydantic schemas for authentication API
"""

from typing import Optional
from pydantic import BaseModel, Field


class SignupDto(BaseModel):
    """Request model for user signup"""
    username: str
    first_name: str
    last_name: str
    email: str
    password: str


class LoginDto(BaseModel):
    """Request model for user login"""
    username: str
    password: str


class AuthResponseDto(BaseModel):
    """Response model for authentication"""
    user_id: int
    username: str
    first_name: str = ""
    last_name: str = ""
    role: str = "user"
    message: str = ""


class UserDto(BaseModel):
    """User record for admin panel"""
    user_id: int
    username: str
    first_name: str
    last_name: str
    email: str
    role: str
    created_at: str


class UpdateRoleDto(BaseModel):
    """Request model for updating a user's role"""
    role: str


class CreateUserDto(BaseModel):
    """Request model for admin creating a new user"""
    username: str
    first_name: str
    last_name: str
    email: str
    password: str
    role: str = "user"


class ResetPasswordDto(BaseModel):
    """Request model for resetting a user's password"""
    username: str
    current_password: str
    new_password: str
