# server/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client
import os

app = FastAPI()

# --- CORS: allow your domain(s) to call this API from the browser ---
origins = [
    "https://myqer.com",
    "https://www.myqer.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Supabase client (uses secure keys from Render env vars) ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role
if not SUPABASE_URL or not SERVICE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SERVICE_KEY)

# --- Models (request bodies) ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# --- Basic health checks you already used ---
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/echo")
def echo(payload: dict):
    return {"you_sent": payload}

# --- Register: create auth user + save profile ---
@app.post("/register")
def register_user(data: RegisterRequest):
    try:
        result = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password,
        })

        # Supabase Python client returns dict-like results; check for error key
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"]["message"])

        # Save profile record (service role can insert despite RLS)
        supabase.table("profiles").insert({
            "email": data.email,
            "full_name": data.full_name
        }).execute()

        return {"ok": True, "message": "Registered. Check your email to confirm."}

    except Exception as e:
        # surface clean error message
        raise HTTPException(status_code=400, detail=str(e))

# --- Login: verify credentials, return session info from Supabase ---
@app.post("/login")
def login_user(data: LoginRequest):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })

        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"]["message"])

        return {"ok": True, "session": result}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
