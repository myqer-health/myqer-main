from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import os
from typing import Optional
from supabase import create_client, Client

# ----- Env & Supabase client -----
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI(title="MYQER Python Service", version="1.0.0")

# CORS: only allow your site
ALLOWED_ORIGINS = ["https://myqer.com", "https://www.myqer.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Models -----
class RegisterBody(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class ProfileBody(BaseModel):
    full_name: Optional[str] = None

# ----- Health -----
@app.get("/health")
def health():
    return {"ok": True}

# ----- Auth -----
@app.post("/register")
def register(body: RegisterBody):
    try:
        res = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"full_name": body.full_name}}
        })
        # also create a profile row (id == user id) so dashboard finds it
        user = res.user
        if user:
            uid = user.id
            supabase.table("profiles").upsert({"id": uid, "full_name": body.full_name}).execute()
        return {"ok": True, "message": "Check your email to confirm your account."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/login")
def login(body: LoginBody):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password
        })
        session = res.session
        user = res.user
        if not session or not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        # Return a simple payload for the frontend
        return {
            "token": session.access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": (user.user_metadata or {}).get("full_name")
            }
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

# ----- Profile (used by dashboard later) -----
def require_token(auth_header: Optional[str]) -> str:
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization")
    return auth_header.removeprefix("Bearer ").strip()

@app.get("/profile")
def get_profile(authorization: Optional[str] = Header(default=None)):
    token = require_token(authorization)
    user = supabase.auth.get_user(token)
    uid = user.user.id
    row = supabase.table("profiles").select("*").eq("id", uid).maybe_single().execute().data
    if not row:
        supabase.table("profiles").insert({"id": uid}).execute()
        row = supabase.table("profiles").select("*").eq("id", uid).maybe_single().execute().data
    return row

@app.post("/profile")
def upsert_profile(body: ProfileBody, authorization: Optional[str] = Header(default=None)):
    token = require_token(authorization)
    user = supabase.auth.get_user(token)
    uid = user.user.id
    supabase.table("profiles").upsert({"id": uid, "full_name": body.full_name}).execute()
    return {"ok": True}
