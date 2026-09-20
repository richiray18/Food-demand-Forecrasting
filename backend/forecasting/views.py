from datetime import datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

import sys
import os

try:
    from ml.predict import predict
    from ml.predict_xgboost import predict_orders
except ImportError:
    from backend.ml.predict import predict
    from backend.ml.predict_xgboost import predict_orders


def _parse_bool_flag(value, default=0):
    if value is None or value == '':
        return default
    val_str = str(value).strip().lower()
    if val_str in ('true', '1', 'yes', 't'):
        return 1
    if val_str in ('false', '0', 'no', 'f'):
        return 0
    return int(val_str)


@api_view(['GET'])
@permission_classes([AllowAny])
def forecast_view(request):
    """
    Forecasting API endpoint.
    Supports:
    1. Real XGBoost Food Demand Forecasting:
       GET /api/forecasting/predict/?meal_id=1885&center_id=13&week=146&checkout_price=136.83&base_price=152.29
       Returns:
       {
           "meal_id": 1885,
           "center_id": 13,
           "week": 146,
           "predicted_orders": 1967
       }

    2. Legacy Cafeteria Prep Fallback:
       GET /api/forecasting/predict/?item_id=1&session_id=2&date=2026-09-07
    """
    # Detect if this is an XGBoost Food Demand Forecasting request
    meal_id = request.query_params.get('meal_id')
    center_id = request.query_params.get('center_id')
    week = request.query_params.get('week')

    if meal_id is not None or center_id is not None or week is not None:
        checkout_price = request.query_params.get('checkout_price')
        base_price = request.query_params.get('base_price')
        emailer_for_promotion = request.query_params.get('emailer_for_promotion', '0')
        homepage_featured = request.query_params.get('homepage_featured', '0')

        # Check required fields
        missing = [
            f for f, v in [
                ('meal_id', meal_id),
                ('center_id', center_id),
                ('week', week),
                ('checkout_price', checkout_price),
                ('base_price', base_price),
            ] if v is None or v == ''
        ]
        if missing:
            return Response(
                {"error": f"Missing required query parameter(s): {', '.join(missing)}"},
                status=400
            )

        # Parse numeric parameters
        try:
            m_id = int(meal_id)
            c_id = int(center_id)
            w = int(week)
            c_price = float(checkout_price)
            b_price = float(base_price)
            e_promo = _parse_bool_flag(emailer_for_promotion, default=0)
            h_feat = _parse_bool_flag(homepage_featured, default=0)
        except (ValueError, TypeError):
            return Response(
                {
                    "error": (
                        "Invalid parameter format. meal_id, center_id, and week must be integers; "
                        "checkout_price and base_price must be numbers; "
                        "emailer_for_promotion and homepage_featured must be 0, 1, true, or false."
                    )
                },
                status=400
            )

        if w <= 0:
            return Response(
                {"error": "week must be a positive integer (>= 1)."},
                status=400
            )

        if c_price < 0 or b_price < 0:
            return Response(
                {"error": "checkout_price and base_price must be non-negative numbers."},
                status=400
            )

        try:
            result = predict_orders(
                meal_id=m_id,
                center_id=c_id,
                week=w,
                checkout_price=c_price,
                base_price=b_price,
                emailer_for_promotion=e_promo,
                homepage_featured=h_feat,
            )
            return Response(result)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            return Response({"error": f"Prediction failed: {str(e)}"}, status=500)

    # Standard NutriFlow cafeteria contract (item_id, session_id, date, is_holiday, is_exam_period, weather_note)
    item_id = request.query_params.get('item_id') or request.query_params.get('item')
    session_id = request.query_params.get('session_id') or request.query_params.get('session')
    date_str = request.query_params.get('date') or datetime.now().strftime('%Y-%m-%d')
    is_holiday = request.query_params.get('is_holiday', 'false').lower() in ('true', '1', 'yes')
    is_exam_period = request.query_params.get('is_exam_period', request.query_params.get('is_exam', 'false')).lower() in ('true', '1', 'yes')
    weather_note = request.query_params.get('weather_note', request.query_params.get('weather', ''))
    headcount = request.query_params.get('headcount')

    if not item_id or not session_id:
        return Response(
            {
                "error": (
                    "Required query parameters missing. "
                    "For Food Demand Forecasting, provide: meal_id, center_id, week, checkout_price, base_price. "
                    "For cafeteria prep forecasting, provide: item_id, session_id, date."
                )
            },
            status=400
        )

    # Support both integer IDs and string dish/session names deterministically
    try:
        parsed_item_id = int(item_id)
    except (ValueError, TypeError):
        parsed_item_id = item_id

    try:
        parsed_session_id = int(session_id)
    except (ValueError, TypeError):
        parsed_session_id = session_id

    parsed_headcount = None
    if headcount is not None and headcount != '':
        try:
            parsed_headcount = float(headcount)
        except (ValueError, TypeError):
            pass

    result = predict(
        item_id=parsed_item_id,
        session_id=parsed_session_id,
        date_str=date_str,
        is_holiday=is_holiday,
        is_exam_period=is_exam_period,
        weather_note=weather_note,
        headcount=parsed_headcount
    )

    return Response(result)


@api_view(['GET'])
@permission_classes([AllowAny])
def options_view(request):
    """Return available meal catalog, centers, and defaults for the forecasting UI."""
    try:
        from ml.predict_xgboost import _load_artifacts
    except ImportError:
        from backend.ml.predict_xgboost import _load_artifacts

    try:
        _, metadata = _load_artifacts()
        meals_list = [
            {"id": m_id, "category": info.get("category", ""), "cuisine": info.get("cuisine", "")}
            for m_id, info in sorted(metadata.get("meals", {}).items())
        ]
        centers_list = [
            {
                "id": c_id,
                "center_type": info.get("center_type", ""),
                "city_code": info.get("city_code", ""),
                "region_code": info.get("region_code", ""),
                "op_area": info.get("op_area", 0)
            }
            for c_id, info in sorted(metadata.get("centers", {}).items())
        ]
        return Response({
            "meals": meals_list,
            "centers": centers_list,
            "default_week": 146,
        })
    except Exception as e:
        return Response({"error": f"Failed to load options: {str(e)}"}, status=500)