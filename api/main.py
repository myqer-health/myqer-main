
from fastapi import FastAPI, Response, Query
from fastapi.middleware.cors import CORSMiddleware
import qrcode
from io import BytesIO

app = FastAPI(title="MYQER Python Service")

# allow your site to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myqer.com", "https://www.myqer.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/qrcode", summary="Return a PNG QR for the given text")
def qr(text: str = Query(..., max_length=2048), box_size: int = 10):
    qr_img = qrcode.make(text, box_size=box_size, border=2)
    buf = BytesIO()
    qr_img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
