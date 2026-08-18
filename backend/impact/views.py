from django.db.models import Sum
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from pickups.models import Pickup

from .models import ImpactRecord
from .serializers import ImpactRecordSerializer, ImpactSummarySerializer


class ImpactRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """Individual impact records, one per completed pickup. Created automatically
    by Pickup.confirm_pickup() — not created/edited through this API."""
    queryset = ImpactRecord.objects.select_related("pickup", "recipient", "pickup__surplus_food").all()
    serializer_class = ImpactRecordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["recipient"]


class ImpactSummaryView(APIView):
    """Aggregated stats for the impact page."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        totals = ImpactRecord.objects.aggregate(
            food_rescued_kg=Sum("food_saved_kg"),
            estimated_savings=Sum("cost_saved"),
        )

        data = {
            "food_rescued_kg": totals["food_rescued_kg"] or 0,
            "pickups_completed": Pickup.objects.filter(status=Pickup.Status.COMPLETED).count(),
            "recipient_count": ImpactRecord.objects.values("recipient").distinct().count(),
            "estimated_savings": totals["estimated_savings"] or 0,
        }
        serializer = ImpactSummarySerializer(data)
        return Response(serializer.data)