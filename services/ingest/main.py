from fastapi import FastAPI, UploadFile, File
from uuid import uuid4

app = FastAPI(title="Ingest Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ingest"}


@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    upload_id = f"upload_{uuid4().hex[:16]}"
    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "status": "accepted",
        "service": "ingest",
    }
