import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

import asyncpg
from pydantic import field_validator

from api.deps import hash_password, verify_password, create_token, get_current_user, get_pool, JWT_EXPIRY_DAYS

router = APIRouter()

ALLOWED_GENDERS = {"Male", "Female", "Other"}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    age: int
    gender: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("confirm_password")
    @classmethod
    def validate_confirm(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int) -> int:
        if v < 1 or v > 149:
            raise ValueError("Age must be between 1 and 149")
        return v

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        if v not in ALLOWED_GENDERS:
            raise ValueError("Gender must be Male, Female, or Other")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def register(body: RegisterRequest, request: Request, response: Response):
    pool = get_pool(request)
    hashed = hash_password(body.password)

    try:
        row = await pool.fetchrow(
            """
            INSERT INTO users (username, password, age, gender)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            body.email,
            hashed,
            body.age,
            body.gender,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

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

    return {"message": "Account created successfully", "user": {"id": user_id, "email": body.email}}


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
