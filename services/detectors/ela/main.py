#!/usr/bin/env python3
"""
Error Level Analysis (ELA) Detector Service
Detects image manipulation by analyzing JPEG re-compression artifacts.
"""

import io
import json
import logging
import os
import time

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageChops
from pydantic import BaseModel
import redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ELA Detector Service", version="1.0.0")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ELA_QUALITY = int(os.getenv("ELA_QUALITY", "90"))

try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except Exception:
    redis_client = None
    logger.warning("Redis unavailable — caching disabled")


class ELAResult(BaseModel):
    upload_id: str
    ela_score: float
    manipulation_detected: bool
    confidence: float
    suspicious_regions: list
    error_level_mean: float
    error_level_max: float
    processing_time: float


def perform_ela(image_bytes: bytes, quality: int = 90) -> dict:
    start = time.time()
    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    original.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    recompressed = Image.open(buf).convert("RGB")
    ela_image = ImageChops.difference(original, recompressed)
    ela_arr = np.array(ela_image).astype(np.float32)
    scaled = np.clip(ela_arr * 10, 0, 255).astype(np.uint8)
    error_mean = float(np.mean(scaled))
    error_max = float(np.max(scaled))
    error_std = float(np.std(scaled))
    threshold = error_mean + 2 * error_std
    mask = scaled.max(axis=2) > threshold
    ratio = float(mask.sum()) / mask.size
    regions = []
    if ratio > 0.01:
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        rmin, rmax = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
        cmin, cmax = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
        regions.append({"x": cmin, "y": rmin, "width": cmax - cmin, "height": rmax - rmin, "severity": min(1.0, ratio * 10)})
    ela_score = min(1.0, (error_mean / 50.0) * (1 + ratio * 5))
    detected = ela_score > 0.35
    confidence = min(0.97, 0.6 + abs(ela_score - 0.35) * 1.5)
    return {
        "ela_score": round(ela_score, 4),
        "manipulation_detected": detected,
        "confidence": round(confidence, 4),
        "suspicious_regions": regions,
        "error_level_mean": round(error_mean, 4),
        "error_level_max": round(error_max, 4),
        "processing_time": round(time.time() - start, 3),
    }


@app.post("/analyze", response_model=ELAResult)
async def analyze(file: UploadFile = File(...), upload_id: str = Form(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    try:
        result = perform_ela(data, ELA_QUALITY)
    except Exception as e:
        logger.error(f"ELA failed: {e}")
        raise HTTPException(500, f"Analysis failed: {e}")
    full = {"upload_id": upload_id, **result}
    if redis_client:
        try:
            redis_client.setex(f"ela:{upload_id}", 3600, json.dumps(full))
        except Exception:
            pass
    logger.info(f"ELA done {upload_id}: score={result['ela_score']}")
    return ELAResult(**full)


@app.get("/result/{upload_id}")
async def get_result(upload_id: str):
    if not redis_client:
        raise HTTPException(503, "Cache unavailable")
    cached = redis_client.get(f"ela:{upload_id}")
    if not cached:
        raise HTTPException(404, "Result not found")
    return json.loads(cached)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ela-detector", "timestamp": time.time()}


app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
