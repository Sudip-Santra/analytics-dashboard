import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator

from api.deps import get_current_user, get_pool

router = APIRouter()

ALLOWED_FEATURES = {"date_picker", "filter_age", "filter_gender", "chart_bar", "chart_line"}
ALLOWED_GENDERS = {"Male", "Female", "Other"}
ALLOWED_AGE_GROUPS = {"<18", "18-40", ">40"}


def parse_naive_dt(iso_str: str) -> datetime:
    """Parse ISO string and strip timezone to get a naive datetime for TIMESTAMP columns."""
    dt = datetime.fromisoformat(iso_str)
    return dt.replace(tzinfo=None)


class TrackRequest(BaseModel):
    feature_name: str

    @field_validator("feature_name")
    @classmethod
    def validate_feature(cls, v: str) -> str:
        if v not in ALLOWED_FEATURES:
            raise ValueError(f"Invalid feature. Allowed: {', '.join(sorted(ALLOWED_FEATURES))}")
        return v


@router.post("/track")
async def track(body: TrackRequest, request: Request):
    payload = await get_current_user(request)
    pool = get_pool(request)
    await pool.execute(
        "INSERT INTO feature_clicks (user_id, feature_name) VALUES ($1, $2)",
        uuid.UUID(payload["sub"]),
        body.feature_name,
    )
    return {"message": "Tracked"}


@router.get("/analytics")
async def analytics(
    request: Request,
    start_date: str | None = None,
    end_date: str | None = None,
    age: str | None = None,
    gender: str | None = None,
    feature: str | None = None,
):
    await get_current_user(request)
    pool = get_pool(request)

    # Validate filter values
    if gender and gender != "all" and gender not in ALLOWED_GENDERS:
        raise HTTPException(status_code=400, detail="Invalid gender filter")
    if age and age != "all" and age not in ALLOWED_AGE_GROUPS:
        raise HTTPException(status_code=400, detail="Invalid age filter")
    if feature and feature not in ALLOWED_FEATURES:
        raise HTTPException(status_code=400, detail="Invalid feature filter")

    conditions = []
    params: list = []
    idx = 1

    if start_date:
        conditions.append(f"fc.timestamp >= ${idx}")
        params.append(parse_naive_dt(start_date))
        idx += 1
    if end_date:
        conditions.append(f"fc.timestamp <= ${idx}")
        params.append(parse_naive_dt(end_date))
        idx += 1
    if age and age != "all":
        if age == "<18":
            conditions.append(f"u.age < ${idx}")
            params.append(18)
        elif age == "18-40":
            conditions.append(f"u.age >= ${idx} AND u.age <= ${idx + 1}")
            params.extend([18, 40])
            idx += 1
        elif age == ">40":
            conditions.append(f"u.age > ${idx}")
            params.append(40)
        idx += 1
    if gender and gender != "all":
        conditions.append(f"u.gender = ${idx}")
        params.append(gender)
        idx += 1
    if feature:
        conditions.append(f"fc.feature_name = ${idx}")
        params.append(feature)
        idx += 1

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    feature_query = f"""
        SELECT fc.feature_name, COUNT(*) as clicks
        FROM feature_clicks fc
        JOIN users u ON u.id = fc.user_id
        {where}
        GROUP BY fc.feature_name
        ORDER BY clicks DESC
    """
    feature_rows = await pool.fetch(feature_query, *params)

    daily_query = f"""
        SELECT DATE(fc.timestamp) as date, COUNT(*) as clicks
        FROM feature_clicks fc
        JOIN users u ON u.id = fc.user_id
        {where}
        GROUP BY DATE(fc.timestamp)
        ORDER BY date
    """
    daily_rows = await pool.fetch(daily_query, *params)

    stats_query = f"""
        SELECT
            COUNT(*) as total_clicks,
            COUNT(DISTINCT fc.user_id) as unique_users
        FROM feature_clicks fc
        JOIN users u ON u.id = fc.user_id
        {where}
    """
    stats = await pool.fetchrow(stats_query, *params)

    return {
        "features": [{"feature": r["feature_name"], "clicks": r["clicks"]} for r in feature_rows],
        "daily": [{"date": r["date"].isoformat(), "clicks": r["clicks"]} for r in daily_rows],
        "stats": {
            "total_clicks": stats["total_clicks"],
            "unique_users": stats["unique_users"],
        },
    }
