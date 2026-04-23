"""
Authentication Service
Handles user signup, login, and session management
"""

import hashlib
import logging
import datetime

from app.connectors.state_db_connector import StateDBConnector
from app.queries import AuthQueries

logger = logging.getLogger(__name__)


class AuthService:
    """Manages user authentication against PostgreSQL"""

    def __init__(self):
        self.db = StateDBConnector()

    @staticmethod
    def _hash_password(password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    def signup(self, username: str, first_name: str, last_name: str, email: str, password: str) -> dict:
        """
        Register a new user.

        Returns:
            dict with user_id, username, first_name, last_name on success

        Raises:
            ValueError if username or email already exists
        """
        # Check if username already exists
        rows = self.db.execute_query(
            AuthQueries.CHECK_USERNAME_EXISTS,
            {"username": username},
        )
        if rows:
            raise ValueError("Username already exists")

        # Check if email already exists
        rows = self.db.execute_query(
            AuthQueries.CHECK_EMAIL_EXISTS,
            {"email": email},
        )
        if rows:
            raise ValueError("Email already exists")

        password_hash = self._hash_password(password)

        user_id = self.db.execute_insert(
            AuthQueries.REGISTER_USER,
            {
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "password_hash": password_hash,
                "role": "user",
                "created_at": datetime.datetime.utcnow(),
            },
        )

        logger.info(f"New user registered: {username} (id={user_id})")
        return {"user_id": user_id, "username": username, "first_name": first_name, "last_name": last_name, "role": "user"}

    def login(self, username: str, password: str) -> dict:
        """
        Authenticate a user.

        Returns:
            dict with user_id and username on success

        Raises:
            ValueError if credentials are invalid
        """
        password_hash = self._hash_password(password)

        rows = self.db.execute_query(
            AuthQueries.AUTHENTICATE_USER,
            {"username": username, "password_hash": password_hash},
        )

        if not rows:
            raise ValueError("Invalid username or password")

        row = rows[0]
        logger.info(f"User logged in: {row[1]} (id={row[0]}) role={row[4]}")
        return {"user_id": row[0], "username": row[1], "first_name": row[2], "last_name": row[3], "role": row[4]}
