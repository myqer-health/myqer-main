from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import os
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI()

# Allow your site to call this API from the browser
ALLOWED_ORIGINS = [
    "https://myqer.com",
    "https://www.myqer.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterBody(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class LoginBody(BaseModel):
    email: EmailStr
    password: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/register")
def register(body: RegisterBody):
    # create auth user (email confirmation will be sent if enabled)
    try:
        res = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"full_name": body.full_name}}
        })
        # res contains user or session depending on your Supabase settings
        return {"ok": True, "message": "Check your email to confirm your account."}
    except Exception as e:
        # Surface a clean message to the UI
        raise HTTPException(status_code=400, detail=str(e))


        raise HTTPException(status_code=401, detail="Invalid email or password")
        from typing import Optional
from fastapi import Depends

class ProfileBody(BaseModel):
    full_name: Optional[str] = None

@app.get("/profile")
def get_profile(authorization: str | None = Header(default=None)):
    token = require_token(authorization)
    user = supabase.auth.get_user(token)
    uid = user.user.id
    row = supabase.table("profiles").select("*").eq("id", uid).maybe_single().execute().data
    # if missing, create a blank row to keep UX simple
    if not row:
        supabase.table("profiles").insert({"id": uid, "full_name": (user.user.user_metadata or {}).get("full_name")}).execute()
        row = supabase.table("profiles").select("*").eq("id", uid).maybe_single().execute().data
    return row

@app.post("/profile")
def upsert_profile(body: ProfileBody, authorization: str | None = Header(default=None)):
    token = require_token(authorization)
    user = supabase.auth.get_user(token)
    uid = user.user.id
    supabase.table("profiles").upsert({"id": uid, "full_name": body.full_name}).execute()
    return {"ok": True}
    @app.post("/login")
def login(body: LoginBody):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password
        })
        session = res.session
        user = res.user
        if not session:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return {
            "ok": True,
            "access_token": session.access_token,
            "user": {"id": user.id, "email": user.email, "full_name": (user.user_metadata or {}).get("full_name")}
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        from pydantic import BaseModel, EmailStr

class ResetBody(BaseModel):
    email: EmailStr

@app.post("/reset-password")
def reset_password(body: ResetBody):
    # Sends a Supabase password reset email
    supabase.auth.reset_password_for_email(
        body.email,
        options={"redirect_to": "https://myqer.com/app.html"}
    )
    # Always return success (don’t leak whether the email exists)
    return {"ok": True, "message": "If that email exists, a reset link was sent."}
