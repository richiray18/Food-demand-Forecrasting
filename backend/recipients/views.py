from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from surplus.models import SurplusFood

from .models import Recipient
from .serializers import RecipientListSerializer, RecipientSerializer
from .services import find_matches_for_surplus


class RecipientViewSet(viewsets.ModelViewSet):
    queryset = Recipient.objects.select_related("user").all()
    serializer_class = RecipientSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active", "capacity_unit"]
    search_fields = ["contact_person", "address", "user__organization_name"]
    ordering_fields = ["created_at", "capacity_quantity"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("available_only") == "true":
            qs = qs.filter(is_active=True, user__is_verified=True)
        return qs

    @action(detail=False, methods=["get"])
    def available(self, request):
        """Recipients that are active and verified — used by matching logic."""
        qs = self.get_queryset().filter(is_active=True, user__is_verified=True)
        page = self.paginate_queryset(qs)
        serializer = RecipientListSerializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="match")
    def match(self, request):
        """Given a surplus_food id, returns ranked eligible recipients."""
        surplus_food_id = request.data.get("surplus_food")
        if not surplus_food_id:
            return Response({"detail": "surplus_food is required."}, status=400)

        try:
            surplus_food = SurplusFood.objects.get(pk=surplus_food_id)
        except SurplusFood.DoesNotExist:
            return Response({"detail": "surplus_food not found."}, status=404)

        matches = find_matches_for_surplus(surplus_food)
        results = [
            {
                "recipient": RecipientListSerializer(recipient).data,
                "score": round(score, 4),
            }
            for recipient, score in matches
        ]
        return Response({"surplus_food": str(surplus_food.id), "matches": results})