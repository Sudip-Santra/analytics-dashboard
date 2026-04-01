"""
Interactive CLI script to add a user to the analytics_dashboard database.
Usage: python backend/scripts/add_user.py
"""

import asyncio
import getpass
import os
import sys
import re

import asyncpg
import bcrypt
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DB_DSN = (
    f"postgresql://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
    f"@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}"
    f"/{os.environ['DB_NAME']}"
)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def prompt_email() -> str:
    while True:
        email = input("Email: ").strip()
        if EMAIL_RE.match(email):
            return email
        print("  Invalid email format. Try again.")


def prompt_password() -> str:
    while True:
        pwd = getpass.getpass("Password: ")
        if len(pwd) < 6:
            print("  Password must be at least 6 characters.")
            continue
        confirm = getpass.getpass("Confirm password: ")
        if pwd != confirm:
            print("  Passwords do not match. Try again.")
            continue
        return pwd


def prompt_age() -> int:
    while True:
        try:
            age = int(input("Age: ").strip())
            if 1 <= age <= 149:
                return age
            print("  Age must be between 1 and 149.")
        except ValueError:
            print("  Please enter a valid number.")


def prompt_gender() -> str:
    while True:
        gender = input("Gender (Male / Female / Other): ").strip().capitalize()
        if gender in ("Male", "Female", "Other"):
            return gender
        print("  Please enter Male, Female, or Other.")


def prompt_is_active() -> bool:
    while True:
        val = input("Is active? (y/n): ").strip().lower()
        if val in ("y", "yes"):
            return True
        if val in ("n", "no"):
            return False
        print("  Please enter y or n.")


async def main():
    print("=" * 45)
    print("  Add User — Product Analytics Dashboard")
    print("=" * 45)
    print()

    email = prompt_email()
    password = prompt_password()
    age = prompt_age()
    gender = prompt_gender()
    is_active = prompt_is_active()

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    print("\nConnecting to database...")
    try:
        conn = await asyncpg.connect(dsn=DB_DSN)
    except Exception as e:
        print(f"Failed to connect: {e}")
        sys.exit(1)

    try:
        await conn.execute(
            """
            INSERT INTO users (username, password, age, gender, is_active)
            VALUES ($1, $2, $3, $4, $5)
            """,
            email,
            hashed,
            age,
            gender,
            is_active,
        )
        print(f"\nUser '{email}' added successfully!")
    except asyncpg.UniqueViolationError:
        print(f"\nError: A user with email '{email}' already exists.")
        sys.exit(1)
    except Exception as e:
        print(f"\nError inserting user: {e}")
        sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
