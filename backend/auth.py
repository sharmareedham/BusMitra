import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

DB_PATH = Path(__file__).parent / "users.db"
SESSION_DAYS = 30
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
MAX_FAILED = 5  # wrong passwords allowed per username...
FAILED_WINDOW = 300  # ...within this many seconds

router = APIRouter(prefix="/api/auth", tags=["auth"])
failed_logins: dict[str, list[float]] = {}


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at REAL NOT NULL
            )"""
        )


init_db()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, time.time() + SESSION_DAYS * 86400),
    )
    return token


def too_many_failures(username: str) -> bool:
    now = time.time()
    recent = [t for t in failed_logins.get(username, []) if now - t < FAILED_WINDOW]
    failed_logins[username] = recent
    return len(recent) >= MAX_FAILED


class Credentials(BaseModel):
    username: str
    password: str


def get_current_user(authorization: Optional[str] = Header(default=None)):
    """Use in other routes: user = Depends(get_current_user)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    token = authorization[7:]
    with db() as conn:
        row = conn.execute(
            """SELECT users.id, users.username, sessions.expires_at
               FROM sessions JOIN users ON users.id = sessions.user_id
               WHERE sessions.token = ?""",
            (token,),
        ).fetchone()
    if not row or row["expires_at"] < time.time():
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    return {"id": row["id"], "username": row["username"]}


@router.post("/register")
def register(data: Credentials):
    username = data.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-20 characters: letters, numbers or _ only.",
        )
    if len(data.password) < 6 or len(data.password) > 100:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    with db() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, hash_password(data.password), time.time()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That username is already taken.")
        token = create_session(conn, cursor.lastrowid)
    return {"token": token, "username": username}


@router.post("/login")
def login(data: Credentials):
    username = data.username.strip().lower()
    if too_many_failures(username):
        raise HTTPException(
            status_code=429, detail="Too many wrong attempts. Try again in a few minutes."
        )

    with db() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if not row or not verify_password(data.password, row["password_hash"]):
            failed_logins.setdefault(username, []).append(time.time())
            raise HTTPException(status_code=401, detail="Wrong username or password.")
        token = create_session(conn, row["id"])

    failed_logins.pop(username, None)
    return {"token": token, "username": username}


@router.get("/me")
def me(authorization: Optional[str] = Header(default=None)):
    return get_current_user(authorization)


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (authorization[7:],))
    return {"ok": True}