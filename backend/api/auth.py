import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from api.deps import verify_password, create_token, get_current_user, get_pool, JWT_EXPIRY_DAYS

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    pool = get_pool(request)
    row = await pool.fetchrow(
        "SELECT id, username, password, is_active FROM users WHERE username = $1",
        body.email,
    )

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    if not verify_password(body.password, row["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(row["id"])
    token = create_token(user_id, body.email)

    response.set_cookie(
        key="auth_token",
        value=token,
        max_age=JWT_EXPIRY_DAYS * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=False,
    )

    return {"message": "Login successful", "user": {"id": user_id, "email": body.email}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out"}


@router.get("/me")
async def me(request: Request):
    payload = await get_current_user(request)
    pool = get_pool(request)
    row = await pool.fetchrow(
        "SELECT id, username, age, gender FROM users WHERE id = $1",
        uuid.UUID(payload["sub"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": str(row["id"]), "email": row["username"], "age": row["age"], "gender": row["gender"]}
