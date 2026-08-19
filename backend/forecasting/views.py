from rest_framework.decorators import api_view
from rest_framework.response import Response
import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ml'))

from predict import predict


@api_view(['GET'])
def forecast_view(request):
    item_id = request.query_params.get('item_id')
    session_id = request.query_params.get('session_id')
    date_str = request.query_params.get('date')
    is_holiday = request.query_params.get('is_holiday', 'false').lower() == 'true'
    is_exam_period = request.query_params.get('is_exam_period', 'false').lower() == 'true'
    weather_note = request.query_params.get('weather_note', '')

    if not item_id or not session_id or not date_str:
        return Response(
            {"error": "item_id, session_id, and date are required query parameters"},
            status=400
        )

    result = predict(
        item_id=int(item_id),
        session_id=int(session_id),
        date_str=date_str,
        is_holiday=is_holiday,
        is_exam_period=is_exam_period,
        weather_note=weather_note
    )

    return Response(result)