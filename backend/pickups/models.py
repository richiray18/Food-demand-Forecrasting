# backend/pickups/models.py
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from surplus.models import SurplusFood


class Pickup(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_TRANSIT = "IN_TRANSIT", "In transit"
        COMPLETED = "COMPLETED", "Completed"
        REJECTED_UNSAFE = "REJECTED_UNSAFE", "Rejected - unsafe"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    surplus_food = models.ForeignKey(SurplusFood, on_delete=models.PROTECT, related_name="pickups")
    recipient = models.ForeignKey("recipients.Recipient", on_delete=models.PROTECT, related_name="pickups")

    quantity_requested = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0.01)])
    quantity_collected = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)

    scheduled_time = models.DateTimeField()
    actual_pickup_time = models.DateTimeField(null=True, blank=True)

    verification_code = models.CharField(max_length=8, blank=True)
    safety_check_passed = models.BooleanField(null=True, blank=True)
    temperature_at_pickup_c = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="pickups_handled",
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_time"]
        indexes = [models.Index(fields=["status", "scheduled_time"])]

    def __str__(self):
        return f"Pickup #{str(self.id)[:8]} - {self.surplus_food.food_name} -> {self.recipient}"

    def clean(self):
        # Skip the remaining-quantity check for pickups that are already finalised —
        # otherwise re-saving a completed pickup would fail against the already-reduced stock.
        if self.status in (self.Status.COMPLETED, self.Status.REJECTED_UNSAFE, self.Status.CANCELLED):
            return
        if self.quantity_requested and self.surplus_food_id:
            if self.quantity_requested > self.surplus_food.quantity_remaining:
                raise ValidationError(
                    f"Requested quantity ({self.quantity_requested}) exceeds available surplus "
                    f"({self.surplus_food.quantity_remaining})."
                )

    def save(self, *args, **kwargs):
        if not self.verification_code:
            self.verification_code = uuid.uuid4().hex[:6].upper()
        self.full_clean(exclude=None)
        super().save(*args, **kwargs)

    def confirm_pickup(self, temperature_c=None, quantity_collected=None, handled_by=None):
        """
        Verifies food safety at the moment of handover and finalises the pickup.
        Rejects the transfer if the surplus item has exceeded its safe window.
        """
        surplus = self.surplus_food
        surplus.mark_expired_if_needed()

        if not surplus.is_safe:
            self.status = self.Status.REJECTED_UNSAFE
            self.safety_check_passed = False
            self.rejection_reason = "Surplus food exceeded its safe time-temperature window."
            self.save()
            return False

        if temperature_c is not None:
            surplus.record_temperature(temperature_c, recorded_by=handled_by)
            if not surplus.is_safe:
                self.status = self.Status.REJECTED_UNSAFE
                self.safety_check_passed = False
                self.temperature_at_pickup_c = temperature_c
                self.rejection_reason = "Temperature reading placed food outside the safe range."
                self.save()
                return False
            self.temperature_at_pickup_c = temperature_c

        qty = quantity_collected or self.quantity_requested
        if qty > surplus.quantity_remaining:
            raise ValidationError("Cannot collect more than the remaining surplus quantity.")

        self.quantity_collected = qty
        self.actual_pickup_time = timezone.now()
        self.status = self.Status.COMPLETED
        self.safety_check_passed = True
        self.handled_by = handled_by
        self.save()

        surplus.quantity_remaining -= qty
        if surplus.quantity_remaining <= 0:
            surplus.status = SurplusFood.Status.PICKED_UP
        surplus.save()

        self._record_impact(qty)
        return True

    def _record_impact(self, quantity):
        """
        Creates/updates the linked impact record. Kept defensive so `pickups`
        works even before the `impact` app's ImpactRecord model is built.
        """
        try:
            from impact.models import ImpactRecord
        except Exception:
            return
        cost_per_unit = Decimal("40.00")   # placeholder - replace with real per-kg cost
        co2e_per_kg = Decimal("2.50")      # placeholder - replace with a verified emission factor
        ImpactRecord.objects.update_or_create(
            pickup=self,
            defaults={
                "food_saved_kg": quantity,
                "cost_saved": quantity * cost_per_unit,
                "co2e_saved_kg": quantity * co2e_per_kg,
                "recipient": self.recipient,
            },
        )

    def reject(self, reason, handled_by=None):
        self.status = self.Status.REJECTED_UNSAFE
        self.rejection_reason = reason
        self.safety_check_passed = False
        self.handled_by = handled_by
        self.save()

    def cancel(self, reason=""):
        self.status = self.Status.CANCELLED
        self.rejection_reason = reason
        self.save()


class PickupMatchLog(models.Model):
    """Audit trail of automated matching decisions between surplus and recipients."""
    surplus_food = models.ForeignKey(SurplusFood, on_delete=models.CASCADE, related_name="match_logs")
    recipient = models.ForeignKey("recipients.Recipient", on_delete=models.CASCADE, related_name="match_logs")
    matched_at = models.DateTimeField(auto_now_add=True)
    score = models.FloatField(help_text="Matching score used to rank recipient eligibility.")
    was_selected = models.BooleanField(default=False)
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-matched_at"]

    def __str__(self):
        return f"{self.surplus_food.food_name} -> {self.recipient} (score={self.score:.2f})"
