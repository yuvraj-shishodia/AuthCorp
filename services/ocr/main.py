from fastapi import FastAPI, UploadFile, File

app = FastAPI(title="OCR Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ocr"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    return {
        "filename": file.filename,
        "text": "",
        "confidence": 0.0,
        "status": "stub",
        "service": "ocr",
    }
