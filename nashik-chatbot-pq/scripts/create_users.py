"""
Admin User Seed Script
======================
Creates admin accounts directly in the database.
Public signup always creates the 'user' role — use this script to
bootstrap the first admin (or any additional admins).

Usage:
    cd nashik-chatbot-pq

    # Fully interactive (all prompts)
    python scripts/create_users.py

    # Pass all values as flags (non-interactive)
    python scripts/create_users.py \\
        --username admin \\
        --first-name Admin \\
        --last-name User \\
        --email admin@company.com \\
        --password "Admin@1234"

    # Create a different role (admin | user | part_labeler)
    python scripts/create_users.py \\
        --username labeler1 \\
        --email labeler1@company.com \\
        --role part_labeler \\
        --password "Labeler@1"
"""

import sys
import os
import argparse
import hashlib
import getpass
import datetime

# Allow imports from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.connectors.state_db_connector import StateDBConnector

ALLOWED_ROLES = {"admin", "user", "part_labeler", "part_labeler_field", "part_labeler_plant"}

INSERT_SQL = """
    INSERT INTO users (username, first_name, last_name, email, password_hash, role, created_at)
    VALUES (:username, :first_name, :last_name, :email, :password_hash, :role, :created_at)
    ON CONFLICT (username) DO NOTHING
    RETURNING user_id
"""

CHECK_EMAIL_SQL = "SELECT user_id FROM users WHERE email = :email"


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(
        description="Create an admin (or other role) user directly in the database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--username",   default=None,   help="Login username (prompted if omitted)")
    parser.add_argument("--email",      default=None,   help="User e-mail address (prompted if omitted)")
    parser.add_argument("--first-name", default=None,   dest="first_name", help="First name (prompted if omitted)")
    parser.add_argument("--last-name",  default=None,   dest="last_name",  help="Last name  (prompted if omitted)")
    parser.add_argument("--password",   default=None,   help="Password (prompted securely if omitted)")
    parser.add_argument(
        "--role",
        default="admin",
        choices=sorted(ALLOWED_ROLES),
        help="Role to assign — admin | user | part_labeler  (default: admin)",
    )
    args = parser.parse_args()

    # Prompt for any missing fields interactively
    username = args.username or input("Username: ").strip()
    if not username:
        print("Error: username cannot be empty.", file=sys.stderr)
        sys.exit(1)

    email = args.email or input("Email: ").strip()
    if not email:
        print("Error: email cannot be empty.", file=sys.stderr)
        sys.exit(1)

    first_name = args.first_name or input("First name [Admin]: ").strip() or "Admin"
    last_name  = args.last_name  or input("Last name  [User]:  ").strip() or "User"

    password = args.password
    if not password:
        password = getpass.getpass(f"Password for '{username}': ")
        confirm  = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Error: passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if not password:
        print("Error: password cannot be empty.", file=sys.stderr)
        sys.exit(1)

    db = StateDBConnector()

    # Check email uniqueness
    if db.execute_query(CHECK_EMAIL_SQL, {"email": email}):
        print(f"Error: e-mail '{email}' is already registered.", file=sys.stderr)
        sys.exit(1)

    params = {
        "username":      username,
        "first_name":    first_name,
        "last_name":     last_name,
        "email":         email,
        "password_hash": hash_password(password),
        "role":          args.role,
        "created_at":    datetime.datetime.utcnow(),
    }

    result = db.execute_insert(INSERT_SQL, params)
    if result:
        print(f"[CREATED] '{username}'  role={args.role}  id={result}")
    else:
        print(f"[SKIPPED] Username '{username}' already exists in the database.")


if __name__ == "__main__":
    main()
