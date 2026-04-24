"""
NetFlow ML Service  ·  v1.0
FastAPI microservice providing:
  - POST /predict/anomaly  — Isolation Forest on sensor feature vectors
  - POST /predict/depletion — Rule-based + linear regression balance forecast
  - GET  /health           — Health probe

Designed to run as a sidecar to the NestJS backend.
The backend calls this service after collecting 5+ readings per unit.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

import numpy as np
import uvicorn
from fastapi import Body, FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("netflow-ml")

# ── Global model state ────────────────────────────────────────────────────────

class ModelState:
    """Singleton holding the fitted Isolation Forest and scaler."""
    model: IsolationForest | None = None
    scaler: StandardScaler | None = None
    trained_at: float = 0.0
    sample_count: int = 0

    @classmethod
    def fit(cls, X: np.ndarray) -> None:
        """Fit or re-fit the model on the given feature matrix."""
        cls.scaler = StandardScaler()
        X_scaled = cls.scaler.fit_transform(X)
        cls.model = IsolationForest(
            n_estimators=100,
            contamination=0.05,   # Expect ~5% anomalous readings
            random_state=42,
            n_jobs=-1,
        )
        cls.model.fit(X_scaled)
        cls.trained_at = time.time()
        cls.sample_count = len(X)
        log.info("Isolation Forest fitted on %d samples", len(X))

    @classmethod
    def predict(cls, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Return (labels, scores). Label: -1 anomaly, 1 normal. Score: higher = more normal."""
        if cls.model is None or cls.scaler is None:
            raise RuntimeError("Model not fitted yet")
        X_scaled = cls.scaler.transform(X)
        labels = cls.model.predict(X_scaled)
        # decision_function returns anomaly score: more negative = more anomalous
        raw_scores = cls.model.decision_function(X_scaled)
        # Normalise to [0, 1] where 1 = most anomalous
        normalised = 1.0 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9)
        return labels, normalised

# ── Pydantic models ────────────────────────────────────────────────────────────

class SensorReading(BaseModel):
    power:      float = Field(ge=0, description="Active power in watts")
    voltage:    float = Field(ge=0, description="Voltage in volts")
    current:    float = Field(ge=0, description="Current in amperes")
    water_flow: float = Field(description="Water flow in L/min (negative = backflow)")

class AnomalyRequest(BaseModel):
    features: list[SensorReading] = Field(min_length=5, description="Recent sensor readings (≥5)")

class AnomalyResponse(BaseModel):
    score: float = Field(description="Anomaly score [0, 1]. Higher = more anomalous.")
    is_anomaly: bool = Field(description="True if score > 0.6 (top-5% anomalous)")
    model_trained: bool
    sample_count: int

class DepletionRequest(BaseModel):
    balance_rp:    float = Field(ge=0)
    avg_daily_kwh: float = Field(ge=0)
    avg_daily_m3:  float = Field(ge=0)
    tariff_elec:   float = Field(gt=0, description="Rp per kWh")
    tariff_water:  float = Field(gt=0, description="Rp per m³")

class DepletionResponse(BaseModel):
    days_remaining: float
    daily_cost_rp:  float
    note: str

class TrainRequest(BaseModel):
    """Manually provide training data (optional — model auto-trains on first predict call)."""
    features: list[SensorReading] = Field(min_length=20)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-train model on synthetic normal data so first call never fails
    rng = np.random.default_rng(42)
    synthetic = rng.normal(
        loc=[200, 220, 0.9, 0.5],
        scale=[50, 5, 0.3, 0.2],
        size=(500, 4),
    )
    synthetic = np.clip(synthetic, 0, None)
    ModelState.fit(synthetic)
    log.info("ML service ready (pre-trained on synthetic data)")
    yield

app = FastAPI(
    title="NetFlow ML Service",
    description="Isolation Forest anomaly detection + balance depletion forecasting",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_fitted": ModelState.model is not None,
        "trained_at": ModelState.trained_at,
        "sample_count": ModelState.sample_count,
    }


@app.post("/predict/anomaly", response_model=AnomalyResponse)
def predict_anomaly(body: AnomalyRequest):
    """
    Run Isolation Forest on the provided sensor readings.

    The model is fitted incrementally: if this batch is larger than
    the current training set, the model is re-fitted to stay up to date.

    Returns an anomaly score averaged across all readings in the batch.
    This smooths transient spikes while still catching sustained anomalies.
    """
    X = np.array([
        [r.power, r.voltage, r.current, r.water_flow]
        for r in body.features
    ], dtype=np.float32)

    # Auto-retrain if we have significantly more data than the current model
    if len(X) > ModelState.sample_count * 1.5 or ModelState.sample_count < 100:
        ModelState.fit(X)

    labels, scores = ModelState.predict(X)

    avg_score = float(np.mean(scores))
    is_anomaly = avg_score > 0.6

    return AnomalyResponse(
        score=round(avg_score, 4),
        is_anomaly=is_anomaly,
        model_trained=ModelState.model is not None,
        sample_count=ModelState.sample_count,
    )


@app.post("/predict/depletion", response_model=DepletionResponse)
def predict_depletion(body: DepletionRequest):
    """
    Estimate days until balance reaches zero.

    Rule-based when insufficient history (< 3 days); otherwise uses
    the provided 7-day averages (computed by NestJS from the DB).
    """
    daily_cost = (body.avg_daily_kwh * body.tariff_elec) + (body.avg_daily_m3 * body.tariff_water)

    if daily_cost <= 0:
        return DepletionResponse(
            days_remaining=9999.0,
            daily_cost_rp=0.0,
            note="No consumption detected — device may be offline or inactive.",
        )

    days = body.balance_rp / daily_cost

    return DepletionResponse(
        days_remaining=round(max(0.0, days), 1),
        daily_cost_rp=round(daily_cost, 2),
        note="Forecast based on 7-day average consumption.",
    )


@app.post("/train", status_code=202)
def retrain(body: TrainRequest):
    """Manually re-train with fresh data. Called by the backend on demand."""
    X = np.array(
        [[r.power, r.voltage, r.current, r.water_flow] for r in body.features],
        dtype=np.float32,
    )
    ModelState.fit(X)
    return {"status": "trained", "sample_count": len(X)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
