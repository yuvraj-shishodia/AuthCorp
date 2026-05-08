from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Risk Service", version="1.0.0")


class RiskRequest(BaseModel):
    upload_id: str
    extracted_text: str | None = None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "risk"}


@app.post("/score")
async def score(request: RiskRequest):
    return {
        "upload_id": request.upload_id,
        "risk_score": 0,
        "risk_category": "low",
        "findings": [],
        "status": "stub",
    }
