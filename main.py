from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import os
from supabase import create_client, Client

# Load Supabase keys from environment (set in Render)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI()

# Allow requests from your website
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myqer.com", "https://www.myqer.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models for request bodies
class RegisterBody(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class LoginBody(BaseModel):
    email: EmailStr
    password: str

# Health check
@app.get("/health")
def health():
    return {"ok": True}

# Register
@app.post("/register")
def register_user(body: RegisterBody):
    res = supabase.auth.sign_up({
        "email": body.email,
        "password": body.password,
        "options": {
            "data": {"full_name": body.full_name}
        }
    })
    if res.user is None:
        raise HTTPException(status_code=400, detail="Registration failed")
    return {"ok": True, "message": "Check your email to confirm account."}

# Login
@app.post("/login")
def login_user(body: LoginBody):
    res = supabase.auth.sign_in_with_password({
        "email": body.email,
        "password": body.password
    })
    if res.user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": res.session.access_token, "user": res.user}

# Forgot password
@app.post("/forgot")
def forgot_password(body: LoginBody):
    supabase.auth.reset_password_email(body.email, {
        "redirect_to": "https://myqer.com/reset.html"
    })
    return {"ok": True, "message": "Password reset email sent."}
