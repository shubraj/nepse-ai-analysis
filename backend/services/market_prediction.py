"""AI-powered market prediction for tomorrow."""

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models.company import Company

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger("market_prediction")

_PREDICTION_PROMPT = """NEPSE market analyst. Predict tomorrow's market movement.

Input data:
- Total stocks: {total_stocks}
- Average % change: {avg_pct_change:.2f}%
- Stocks up: {stocks_up}
- Stocks down: {stocks_down}
- Top gainers today: {top_gainers}
- Top losers today: {top_losers}

Output JSON:
{{
  "sentiment": "bullish|bearish|neutral",
  "direction": "up|down|flat",
  "confidence": 1-10,
  "predicted_change_pct": "-2 to +2",
  "key_factors": ["factor1", "factor2"],
  "summary": "One sentence prediction summary"
}}

Rules:
- sentiment: overall market sentiment
- direction: predicted direction (up/down/flat)
- confidence: 1-10 scale
- predicted_change_pct: estimated NEPSE index change percentage
- key_factors: 2-3 key factors driving prediction
- summary: brief prediction in plain language (max 150 chars)

Return valid JSON only."""


def _build_market_context(db: Session) -> dict[str, Any]:
    """Build market context for prediction."""
    companies = db.query(Company).all()

    total = len(companies)
    if total == 0:
        return {
            "total_stocks": 0,
            "avg_pct_change": 0.0,
            "stocks_up": 0,
            "stocks_down": 0,
            "top_gainers": [],
            "top_losers": [],
        }

    pct_changes = []
    stocks_up = 0
    stocks_down = 0

    gainers = []
    losers = []

    for c in companies:
        overview = c.overview or {}
        pct_str = overview.get("pct_change") or "0"
        try:
            pct = float(str(pct_str).replace("%", "").strip())
            pct_changes.append(pct)

            if pct > 0:
                stocks_up += 1
                gainers.append({"symbol": c.symbol, "change": pct})
            elif pct < 0:
                stocks_down += 1
                losers.append({"symbol": c.symbol, "change": pct})
        except (ValueError, TypeError):
            continue

    avg_change = sum(pct_changes) / len(pct_changes) if pct_changes else 0.0

    # Sort and get top 5
    gainers.sort(key=lambda x: x["change"], reverse=True)
    losers.sort(key=lambda x: x["change"])

    return {
        "total_stocks": total,
        "avg_pct_change": avg_change,
        "stocks_up": stocks_up,
        "stocks_down": stocks_down,
        "top_gainers": gainers[:5],
        "top_losers": losers[:5],
    }


def generate_market_prediction(db: Session) -> dict[str, Any]:
    """Generate tomorrow's market prediction using AI."""
    if not genai:
        logger.error("google-genai not installed")
        return _fallback_prediction()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY not set")
        return _fallback_prediction()

    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    context = _build_market_context(db)

    prompt = _PREDICTION_PROMPT.format(
        total_stocks=context["total_stocks"],
        avg_pct_change=context["avg_pct_change"],
        stocks_up=context["stocks_up"],
        stocks_down=context["stocks_down"],
        top_gainers=json.dumps(context["top_gainers"]),
        top_losers=json.dumps(context["top_losers"]),
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
            },
        )

        text = (response.text or "").strip()
        data = json.loads(text)

        # Validate required fields
        required = ["sentiment", "direction", "confidence", "summary"]
        for key in required:
            if key not in data:
                data[key] = "neutral" if key in ["sentiment", "direction"] else (5 if key == "confidence" else "Prediction unavailable")

        return data

    except Exception as e:
        logger.error("Prediction generation failed: %s", e)
        return _fallback_prediction()


def _fallback_prediction() -> dict[str, Any]:
    """Return fallback prediction when AI fails."""
    return {
        "sentiment": "neutral",
        "direction": "flat",
        "confidence": 5,
        "predicted_change_pct": "0",
        "key_factors": ["Market data unavailable", "Insufficient data for prediction"],
        "summary": "Unable to generate prediction. Check back later.",
    }


def get_or_create_prediction(db: Session) -> dict[str, Any]:
    """Get today's prediction or generate a new one."""
    from models.market_prediction import MarketPrediction

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)

    # Check if we have a prediction for tomorrow
    existing = (
        db.query(MarketPrediction)
        .filter(MarketPrediction.prediction_for >= today)
        .order_by(MarketPrediction.predicted_at.desc())
        .first()
    )

    if existing:
        return {
            "id": existing.id,
            "predicted_at": existing.predicted_at.isoformat(),
            "prediction_for": existing.prediction_for.isoformat(),
            **existing.prediction,
        }

    # Generate new prediction
    prediction_data = generate_market_prediction(db)

    new_prediction = MarketPrediction(
        predicted_at=datetime.now(),
        prediction_for=tomorrow,
        prediction=prediction_data,
    )
    db.add(new_prediction)
    db.commit()

    return {
        "id": new_prediction.id,
        "predicted_at": new_prediction.predicted_at.isoformat(),
        "prediction_for": new_prediction.prediction_for.isoformat(),
        **prediction_data,
    }
