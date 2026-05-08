from fastapi import FastAPI, UploadFile, File, Form

app = FastAPI(title="Metadata Detector Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "detector-metadata"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...), upload_id: str = Form(...)):
    return {
        "upload_id": upload_id,
        "service": "detector-metadata",
        "filename": file.filename,
        "metadata_score": 0.0,
        "suspicious_fields": [],
        "status": "stub",
    }
