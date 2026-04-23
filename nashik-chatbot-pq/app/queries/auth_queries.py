"""
Auth Queries
SQL queries for user authentication and management.
All queries use parameterized placeholders for security.
"""


class AuthQueries:
    """
    SQL queries for user authentication and management.
    """

    # ==================== SELECT QUERIES ====================

    CHECK_USERNAME_EXISTS = """
        SELECT user_id FROM users WHERE username = :username
    """

    CHECK_EMAIL_EXISTS = """
        SELECT user_id FROM users WHERE email = :email
    """

    AUTHENTICATE_USER = """
        SELECT user_id, username, first_name, last_name, role
        FROM users
        WHERE username = :username AND password_hash = :password_hash
    """

    # ==================== INSERT QUERIES ====================

    REGISTER_USER = """
        INSERT INTO users (username, first_name, last_name, email, password_hash, role, created_at)
        VALUES (:username, :first_name, :last_name, :email, :password_hash, :role, :created_at)
        RETURNING user_id
    """

    # ==================== ADMIN QUERIES ====================

    GET_ALL_USERS = """
        SELECT user_id, username, first_name, last_name, email, role, created_at
        FROM users
        ORDER BY created_at DESC
    """

    GET_USER_ROLE = """
        SELECT role FROM users WHERE user_id = :user_id
    """

    DELETE_USER = """
        DELETE FROM users WHERE user_id = :user_id
    """

    UPDATE_USER_ROLE = """
        UPDATE users SET role = :role WHERE user_id = :user_id
    """

    GET_PASSWORD_HASH = """
        SELECT password_hash FROM users WHERE username = :username
    """

    RESET_PASSWORD = """
        UPDATE users SET password_hash = :password_hash WHERE username = :username
    """
