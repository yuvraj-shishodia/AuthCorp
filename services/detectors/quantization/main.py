from fastapi import FastAPI, UploadFile, File, Form

app = FastAPI(title="Quantization Detector Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "detector-quantization"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...), upload_id: str = Form(...)):
    return {
        "upload_id": upload_id,
        "service": "detector-quantization",
        "filename": file.filename,
        "quantization_score": 0.0,
        "status": "stub",
    }
