
from fastapi import FastAPI, HTTPException, Header
# ... (imports unchanged)

# ADD helper to require bearer token
def require_token(authorization: str | None):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return authorization.split(" ", 1)[1]

# ... keep /health and /register as you have ...

@app.post("/login")
def login(body: LoginBody):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password
        })
        # res.session contains access_token
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
