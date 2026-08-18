from django.db import models

from pickups.models import Pickup
from recipients.models import Recipient


class ImpactRecord(models.Model):
    """
    One record per completed pickup, created by Pickup.confirm_pickup()
    via _record_impact(). Do not rename these fields — pickups/models.py
    calls ImpactRecord.objects.update_or_create(pickup=self, defaults={...})
    with this exact field set.
    """
    pickup = models.OneToOneField(
        Pickup, on_delete=models.CASCADE, related_name="impact_record"
    )
    recipient = models.ForeignKey(
        Recipient, on_delete=models.PROTECT, related_name="impact_records"
    )

    food_saved_kg = models.DecimalField(max_digits=10, decimal_places=2)
    cost_saved = models.DecimalField(max_digits=10, decimal_places=2)
    co2e_saved_kg = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Impact: {self.food_saved_kg}kg via {self.pickup_id}"