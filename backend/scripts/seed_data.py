"""
Seed script to populate feature_clicks with 50-100 dummy records.
Usage: python backend/scripts/seed_data.py
"""

import asyncio
import os
import sys
import random
from datetime import datetime, timedelta

import asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DB_DSN = (
    f"postgresql://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
    f"@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}"
    f"/{os.environ['DB_NAME']}"
)

FEATURE_NAMES = [
    "date_picker",
    "filter_age",
    "filter_gender",
    "chart_bar",
    "chart_line",
]


async def main():
    print("=" * 45)
    print("  Seed Data — Product Analytics Dashboard")
    print("=" * 45)
    print()

    user_id = input("Enter user UUID to seed data for: ").strip()
    if not user_id:
        print("User ID is required.")
        sys.exit(1)

    print("\nConnecting to database...")
    try:
        conn = await asyncpg.connect(dsn=DB_DSN)
    except Exception as e:
        print(f"Failed to connect: {e}")
        sys.exit(1)

    try:
        # Verify user exists
        row = await conn.fetchrow(
            "SELECT id, username FROM users WHERE id = $1",
            __import__("uuid").UUID(user_id),
        )
        if not row:
            print(f"Error: No user found with ID '{user_id}'")
            sys.exit(1)

        print(f"Seeding data for user: {row['username']}")

        # Generate 80-100 records spread across the last 90 days
        record_count = random.randint(80, 100)
        now = datetime.now()
        records = []

        for _ in range(record_count):
            days_ago = random.randint(0, 90)
            hours = random.randint(8, 22)
            minutes = random.randint(0, 59)
            seconds = random.randint(0, 59)

            ts = (now - timedelta(days=days_ago)).replace(
                hour=hours, minute=minutes, second=seconds, microsecond=0
            )
            feature = random.choice(FEATURE_NAMES)
            records.append((row["id"], feature, ts))

        # Bulk insert
        await conn.executemany(
            "INSERT INTO feature_clicks (user_id, feature_name, timestamp) VALUES ($1, $2, $3)",
            records,
        )

        print(f"\nInserted {record_count} feature click records across 90 days.")
        print("\nBreakdown:")
        from collections import Counter
        counts = Counter(r[1] for r in records)
        for feature, count in sorted(counts.items()):
            print(f"  {feature}: {count}")

    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
