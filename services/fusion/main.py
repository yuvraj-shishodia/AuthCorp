#!/usr/bin/env python3
"""
Fusion Service
Aggregates results from all detector microservices into a single verdict.
Uses weighted scoring with confidence-adjusted fusion.
"""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Fusion Service", version="1.0.0")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except Exception:
    redis_client = None

# Detector weights — must sum to 1.0
WEIGHTS = {
    "ela": 0.30,
    "metadata": 0.20,
    "quantization": 0.25,
    "ocr": 0.15,
    "ai_detection": 0.10,
}

RISK_THRESHOLDS = {
    "low": 0.25,
    "medium": 0.50,
    "high": 0.75,
    "critical": 0.90,
}


class DetectorInput(BaseModel):
    ela: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    quantization: Optional[Dict[str, Any]] = None
    ocr: Optional[Dict[str, Any]] = None
    ai_detection: Optional[Dict[str, Any]] = None


class FusionResult(BaseModel):
    upload_id: str
    final_verdict: str  # authentic | tampered | ai_generated | suspicious | inconclusive
    authenticity_score: float  # 0-100 (higher = more authentic)
    risk_score: float  # 0-1 (higher = more risky)
    risk_level: str  # low | medium | high | critical
    confidence: float  # 0-1
    contributing_detectors: List[str]
    evidence_summary: List[str]
    recommendation: str
    processing_time: float


def normalize_detector_score(detector_name: str, result: Dict) -> Optional[float]:
    """Extract a 0-1 manipulation score from each detector's result."""
    if not result:
        return None
    try:
        if detector_name == "ela":
            return float(result.get("ela_score", 0))
        elif detector_name == "metadata":
            return float(result.get("risk_score", 0))
        elif detector_name == "quantization":
            return float(result.get("quantization_score", 0))
        elif detector_name == "ocr":
            font_consistency = float(result.get("fontConsistency", 100))
            return max(0, (100 - font_consistency) / 100)
        elif detector_name == "ai_detection":
            return float(result.get("confidence", 0)) if result.get("isAIGenerated") else 0.05
    except (TypeError, ValueError):
        pass
    return None


def compute_fusion(upload_id: str, detectors: DetectorInput) -> FusionResult:
    start = time.time()
    scores = {}
    confidences = {}
    evidence = []
    contributing = []

    detector_map = {
        "ela": detectors.ela,
        "metadata": detectors.metadata,
        "quantization": detectors.quantization,
        "ocr": detectors.ocr,
        "ai_detection": detectors.ai_detection,
    }

    for name, result in detector_map.items():
        score = normalize_detector_score(name, result)
        if score is not None:
            scores[name] = score
            conf = float((result or {}).get("confidence", 0.7))
            confidences[name] = conf
            contributing.append(name)

            # Collect evidence strings
            if name == "ela" and result.get("manipulation_detected"):
                evidence.append(f"ELA: manipulation artifacts detected (score {score:.2f})")
            if name == "metadata" and result.get("tampering_indicators"):
                for ti in result["tampering_indicators"][:2]:
                    evidence.append(f"Metadata: {ti.get('description', 'anomaly detected')}")
            if name == "quantization" and result.get("double_compression_detected"):
                evidence.append("Quantization: double-compression artifacts found")
            if name == "ai_detection" and result.get("isAIGenerated"):
                evidence.append(f"AI Detection: {result.get('aiType', 'AI')} content detected")
            if name == "ocr" and result.get("anomalies"):
                for a in result["anomalies"][:2]:
                    evidence.append(f"OCR: {a}")

    if not scores:
        return FusionResult(
            upload_id=upload_id,
            final_verdict="inconclusive",
            authenticity_score=50.0,
            risk_score=0.5,
            risk_level="medium",
            confidence=0.3,
            contributing_detectors=[],
            evidence_summary=["No detector results available"],
            recommendation="Run a complete analysis with all detectors enabled.",
            processing_time=round(time.time() - start, 3),
        )

    # Weighted confidence-adjusted fusion
    total_weight = 0.0
    weighted_sum = 0.0
    for name, score in scores.items():
        w = WEIGHTS.get(name, 0.1)
        c = confidences.get(name, 0.7)
        weighted_sum += score * w * c
        total_weight += w * c

    risk_score = weighted_sum / total_weight if total_weight > 0 else 0.5
    authenticity_score = round((1 - risk_score) * 100, 1)
    avg_confidence = sum(confidences.values()) / len(confidences) if confidences else 0.7

    # Verdict
    if risk_score >= RISK_THRESHOLDS["critical"]:
        verdict = "ai_generated" if detector_map.get("ai_detection", {}) and detector_map["ai_detection"].get("isAIGenerated") else "tampered"
        recommendation = "Reject document. High-confidence forgery indicators present. Escalate for expert review."
        risk_level = "critical"
    elif risk_score >= RISK_THRESHOLDS["high"]:
        verdict = "suspicious"
        recommendation = "Flag for manual review. Multiple manipulation indicators detected."
        risk_level = "high"
    elif risk_score >= RISK_THRESHOLDS["medium"]:
        verdict = "suspicious"
        recommendation = "Request additional verification from the submitting party."
        risk_level = "medium"
    elif risk_score >= RISK_THRESHOLDS["low"]:
        verdict = "authentic"
        recommendation = "Document appears authentic. Standard processing can proceed."
        risk_level = "low"
    else:
        verdict = "authentic"
        recommendation = "No significant manipulation indicators found."
        risk_level = "low"

    if not evidence:
        evidence.append("No significant manipulation indicators detected across all detectors.")

    result = FusionResult(
        upload_id=upload_id,
        final_verdict=verdict,
        authenticity_score=authenticity_score,
        risk_score=round(risk_score, 4),
        risk_level=risk_level,
        confidence=round(avg_confidence, 4),
        contributing_detectors=contributing,
        evidence_summary=evidence,
        recommendation=recommendation,
        processing_time=round(time.time() - start, 3),
    )

    if redis_client:
        try:
            redis_client.setex(f"fusion:{upload_id}", 3600, result.json())
        except Exception:
            pass

    logger.info(f"Fusion done {upload_id}: verdict={verdict}, risk={risk_score:.3f}")
    return result


@app.post("/fuse", response_model=FusionResult)
async def fuse(upload_id: str, detectors: DetectorInput):
    return compute_fusion(upload_id, detectors)


@app.get("/result/{upload_id}", response_model=FusionResult)
async def get_result(upload_id: str):
    if not redis_client:
        raise HTTPException(503, "Cache unavailable")
    cached = redis_client.get(f"fusion:{upload_id}")
    if not cached:
        raise HTTPException(404, "Result not found")
    return json.loads(cached)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "fusion", "timestamp": time.time()}


app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006)
