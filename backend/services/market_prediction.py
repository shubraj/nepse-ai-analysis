"""AI-powered market prediction for tomorrow."""

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models.company import Company

from openai import OpenAI

logger = logging.getLogger("market_prediction")

_PREDICTION_PROMPT = """NEPSE market analyst. Predict tomorrow's market movement.

Input data:
- Total stocks: {total_stocks}
- Average % change: {avg_pct_change:.2f}%
- Stocks up: {stocks_up}
- Stocks down: {stocks_down}
- Top gainers today: {top_gainers}
- Top losers today: {top_losers}
- Breadth score: {breadth_score:.2f}
- Recent trend score: {trend_score:.2f}
{news_section}
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
- sentiment: overall market sentiment from breadth, trend, and recent performance
- direction: predicted direction (up/down/flat)
- confidence: 1-10 scale, conservative when breadth is mixed
- predicted_change_pct: estimated NEPSE index change percentage in a tight range around zero unless trend is strong
- key_factors: 2-3 key factors driving prediction, based only on the input data
- summary: brief prediction in plain language (max 150 chars)
- If the market is mixed, prefer neutral/flat instead of forcing a strong call.
- Factor recent news events (floods, political events, NRB decisions) into your sentiment and key_factors.

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
    breadth_score = (stocks_up - stocks_down) / total if total else 0.0
    trend_score = avg_change

    # Sort and get top 5
    gainers.sort(key=lambda x: x["change"], reverse=True)
    losers.sort(key=lambda x: x["change"])

    return {
        "total_stocks": total,
        "avg_pct_change": avg_change,
        "stocks_up": stocks_up,
        "stocks_down": stocks_down,
        "breadth_score": breadth_score,
        "trend_score": trend_score,
        "top_gainers": gainers[:5],
        "top_losers": losers[:5],
    }


def generate_market_prediction(db: Session) -> dict[str, Any]:
    """Generate tomorrow's market prediction using AI."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.error("OPENROUTER_API_KEY not set")
        return _fallback_prediction()

    model = os.getenv("OPENROUTER_MODEL", "google/gemini-flash-1.5")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    context = _build_market_context(db)

    try:
        from services.news_service import NewsService
        headlines = NewsService.get_recent_headlines(db, days=7, limit=10)
        if headlines:
            news_section = "- Recent Nepal market news:\n" + "\n".join(f"  * {h}" for h in headlines) + "\n"
        else:
            news_section = ""
    except Exception:
        news_section = ""

    prompt = _PREDICTION_PROMPT.format(
        total_stocks=context["total_stocks"],
        avg_pct_change=context["avg_pct_change"],
        stocks_up=context["stocks_up"],
        stocks_down=context["stocks_down"],
        breadth_score=context["breadth_score"],
        trend_score=context["trend_score"],
        top_gainers=json.dumps(context["top_gainers"]),
        top_losers=json.dumps(context["top_losers"]),
        news_section=news_section,
    )

    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Return only valid JSON. Be conservative, data-driven, and avoid overconfident market calls.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0,
        )

        text = (response.choices[0].message.content or "").strip()
        import re
        if text.startswith("```"):
            m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
            if m:
                text = m.group(1).strip()
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
