"""
NetFlow ML Service  ·  v2.0
FastAPI microservice providing:
  POST /predict/anomaly   - Isolation Forest on sensor feature vectors
  POST /predict/depletion - Balance depletion forecast
  POST /train             - Retrain model with real field data
  GET  /model/info        - Model metadata & training history
  GET  /health            - Health probe (Prometheus-compatible)

Model persistence: fitted model is saved to MODEL_PATH on every train call
and loaded on startup, so restarts preserve field-data-trained models.
"""

from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import joblib
import numpy as np
import uvicorn
from fastapi import Body, FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_DIR  = Path(os.getenv("MODEL_DIR", "./model"))
MODEL_PATH = MODEL_DIR / "isolation_forest.joblib"
META_PATH  = MODEL_DIR / "model_meta.json"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FEATURE_NAMES = ["power_w", "voltage_v", "current_a", "water_flow_lpm"]
ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "0.6"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("netflow-ml")

# ── Model state ───────────────────────────────────────────────────────────────

class ModelState:
    model:        IsolationForest | None = None
    scaler:       StandardScaler  | None = None
    trained_at:   float = 0.0
    sample_count: int   = 0
    source:       str   = "none"          # "synthetic" | "field" | "mixed"
    history:      list  = []              # [{timestamp, sample_count, source}]

    @classmethod
    def fit(cls, X: np.ndarray, source: str = "field") -> None:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        model = IsolationForest(
            n_estimators=200,             # more trees → more stable on small field data
            contamination=0.05,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_scaled)

        cls.scaler       = scaler
        cls.model        = model
        cls.trained_at   = time.time()
        cls.sample_count = len(X)
        cls.source       = source
        cls.history.append({
            "timestamp":    cls.trained_at,
            "sample_count": cls.sample_count,
            "source":       source,
        })
        cls.history = cls.history[-20:]   # keep last 20 training runs

        cls._save()
        log.info("IsolationForest fitted - samples=%d source=%s", len(X), source)

    @classmethod
    def predict(cls, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if cls.model is None or cls.scaler is None:
            raise RuntimeError("Model not fitted")
        X_scaled = cls.scaler.transform(X)
        labels     = cls.model.predict(X_scaled)
        raw_scores = cls.model.decision_function(X_scaled)
        rng = raw_scores.max() - raw_scores.min() + 1e-9
        normalised = 1.0 - (raw_scores - raw_scores.min()) / rng
        return labels, normalised

    @classmethod
    def _save(cls) -> None:
        try:
            joblib.dump({"model": cls.model, "scaler": cls.scaler}, MODEL_PATH)
            meta = {
                "trained_at":   cls.trained_at,
                "sample_count": cls.sample_count,
                "source":       cls.source,
                "history":      cls.history,
            }
            META_PATH.write_text(json.dumps(meta, indent=2))
            log.info("Model saved to %s", MODEL_PATH)
        except Exception as exc:
            log.warning("Could not save model: %s", exc)

    @classmethod
    def load(cls) -> bool:
        """Load persisted model. Returns True if loaded, False if not found."""
        if not MODEL_PATH.exists():
            return False
        try:
            bundle         = joblib.load(MODEL_PATH)
            cls.model      = bundle["model"]
            cls.scaler     = bundle["scaler"]
            if META_PATH.exists():
                meta           = json.loads(META_PATH.read_text())
                cls.trained_at   = meta.get("trained_at", 0.0)
                cls.sample_count = meta.get("sample_count", 0)
                cls.source       = meta.get("source", "unknown")
                cls.history      = meta.get("history", [])
            log.info("Loaded persisted model - samples=%d source=%s", cls.sample_count, cls.source)
            return True
        except Exception as exc:
            log.warning("Could not load model: %s", exc)
            return False

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SensorReading(BaseModel):
    power:      float = Field(ge=0)
    voltage:    float = Field(ge=0)
    current:    float = Field(ge=0)
    water_flow: float = Field(description="L/min; negative = backflow")

class AnomalyRequest(BaseModel):
    features: list[SensorReading] = Field(min_length=5)

class AnomalyResponse(BaseModel):
    score:         float
    is_anomaly:    bool
    model_trained: bool
    sample_count:  int
    source:        str

class DepletionRequest(BaseModel):
    balance_rp:    float = Field(ge=0)
    avg_daily_kwh: float = Field(ge=0)
    avg_daily_m3:  float = Field(ge=0)
    tariff_elec:   float = Field(gt=0)
    tariff_water:  float = Field(gt=0)

class DepletionResponse(BaseModel):
    days_remaining: float
    daily_cost_rp:  float
    note:           str

class TrainRequest(BaseModel):
    features: list[SensorReading] = Field(min_length=20)
    source:   str = "field"

class TrainResponse(BaseModel):
    status:       str
    sample_count: int
    source:       str
    trained_at:   float

class ModelInfoResponse(BaseModel):
    model_fitted:  bool
    sample_count:  int
    source:        str
    trained_at:    float
    threshold:     float
    feature_names: list[str]
    history:       list[dict]

# ── App lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    loaded = ModelState.load()
    if not loaded:
        # Pre-train on synthetic normal data - replaced on first real /train call
        rng       = np.random.default_rng(42)
        synthetic = rng.normal(
            loc=[200, 220, 0.9, 0.5],
            scale=[50, 5, 0.3, 0.2],
            size=(500, 4),
        )
        synthetic = np.clip(synthetic, 0, None)
        ModelState.fit(synthetic, source="synthetic")
        log.info("No persisted model found - using synthetic pre-trained model")
    log.info("ML service ready (model source: %s)", ModelState.source)
    yield

app = FastAPI(
    title="NetFlow ML Service",
    description="Isolation Forest anomaly detection + balance depletion forecast",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":        "ok",
        "model_fitted":  ModelState.model is not None,
        "model_source":  ModelState.source,
        "trained_at":    ModelState.trained_at,
        "sample_count":  ModelState.sample_count,
        "model_path":    str(MODEL_PATH),
        "model_on_disk": MODEL_PATH.exists(),
    }


@app.get("/model/info", response_model=ModelInfoResponse)
def model_info():
    """Full model metadata - exposed via NestJS admin proxy."""
    return ModelInfoResponse(
        model_fitted  = ModelState.model is not None,
        sample_count  = ModelState.sample_count,
        source        = ModelState.source,
        trained_at    = ModelState.trained_at,
        threshold     = ANOMALY_THRESHOLD,
        feature_names = FEATURE_NAMES,
        history       = ModelState.history,
    )


@app.post("/predict/anomaly", response_model=AnomalyResponse)
def predict_anomaly(body: AnomalyRequest):
    """
    Run Isolation Forest on sensor readings.

    Auto-retrains when accumulated batch is 2× current training set AND
    the current model was trained on synthetic data - avoids overwriting
    field-data-trained models with noisy batch data.
    """
    X = np.array(
        [[r.power, r.voltage, r.current, r.water_flow] for r in body.features],
        dtype=np.float32,
    )

    if ModelState.source == "synthetic" and (
        len(X) > ModelState.sample_count * 2 or ModelState.sample_count < 50
    ):
        ModelState.fit(X, source="field")

    labels, scores = ModelState.predict(X)
    avg_score = float(np.mean(scores))

    return AnomalyResponse(
        score         = round(avg_score, 4),
        is_anomaly    = avg_score > ANOMALY_THRESHOLD,
        model_trained = ModelState.model is not None,
        sample_count  = ModelState.sample_count,
        source        = ModelState.source,
    )


@app.post("/predict/depletion", response_model=DepletionResponse)
def predict_depletion(body: DepletionRequest):
    daily_cost = (body.avg_daily_kwh * body.tariff_elec) + (body.avg_daily_m3 * body.tariff_water)
    if daily_cost <= 0:
        return DepletionResponse(
            days_remaining=9999.0,
            daily_cost_rp=0.0,
            note="No consumption detected - device may be offline.",
        )
    days = body.balance_rp / daily_cost
    return DepletionResponse(
        days_remaining=round(max(0.0, days), 1),
        daily_cost_rp =round(daily_cost, 2),
        note          ="Forecast based on 7-day average consumption.",
    )


@app.post("/train", response_model=TrainResponse, status_code=202)
def retrain(body: TrainRequest):
    """
    Retrain with real field data. Called by NestJS on schedule or on demand.

    Persists model to MODEL_PATH so restarts preserve field-trained state.
    """
    X = np.array(
        [[r.power, r.voltage, r.current, r.water_flow] for r in body.features],
        dtype=np.float32,
    )
    ModelState.fit(X, source=body.source)
    return TrainResponse(
        status       ="trained",
        sample_count =ModelState.sample_count,
        source       =ModelState.source,
        trained_at   =ModelState.trained_at,
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
