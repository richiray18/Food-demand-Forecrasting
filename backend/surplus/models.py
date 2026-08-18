# backend/surplus/models.py
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class FoodSafetyRule(models.Model):
    """
    Encodes time/temperature safety limits per food risk category, based on
    HACCP-style Time-Temperature Control for Safety (TCS) guidance.
    e.g. Potentially Hazardous Food (PHF): danger zone 5C-60C, max ~4h cumulative.
    """

    class RiskCategory(models.TextChoices):
        LOW = "LOW", "Low risk (dry / shelf-stable)"
        MEDIUM = "MEDIUM", "Medium risk (cooked, low moisture)"
        HIGH = "HIGH", "High risk / TCS food (dairy, meat, rice, gravies)"

    name = models.CharField(max_length=100, unique=True)
    risk_category = models.CharField(
        max_length=10, choices=RiskCategory.choices, default=RiskCategory.HIGH
    )
    max_hold_minutes_danger_zone = models.PositiveIntegerField(
        default=240,
        help_text="Max cumulative minutes food may spend between 5C-60C before it's unsafe.",
    )
    max_hold_minutes_cold = models.PositiveIntegerField(
        default=1440, help_text="Max minutes safe when held at or below 5C (refrigerated)."
    )
    max_hold_minutes_hot = models.PositiveIntegerField(
        default=240, help_text="Max minutes safe when held at or above 60C (hot holding)."
    )
    danger_zone_min_c = models.DecimalField(max_digits=4, decimal_places=1, default=5.0)
    danger_zone_max_c = models.DecimalField(max_digits=4, decimal_places=1, default=60.0)

    def __str__(self):
        return f"{self.name} ({self.get_risk_category_display()})"


class SurplusFood(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        RESERVED = "RESERVED", "Reserved for pickup"
        PICKED_UP = "PICKED_UP", "Picked up"
        EXPIRED = "EXPIRED", "Expired / unsafe"
        DISCARDED = "DISCARDED", "Discarded"

    class Unit(models.TextChoices):
        KG = "KG", "Kilograms"
        LITRE = "LITRE", "Litres"
        PORTION = "PORTION", "Portions / servings"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal = models.ForeignKey(
        "meals.MealConsumptionLog", on_delete=models.PROTECT, related_name="surplus_entries",
        null=True, blank=True,
    )
    
    food_name = models.CharField(max_length=200)
    safety_rule = models.ForeignKey(
        FoodSafetyRule, on_delete=models.PROTECT, related_name="surplus_entries"
    )

    quantity = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0.01)])
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.KG)
    quantity_remaining = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(0)])

    prepared_at = models.DateTimeField(help_text="Time food was cooked / prepared.")
    storage_location = models.CharField(max_length=150, blank=True)
    current_temperature_c = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    is_refrigerated = models.BooleanField(default=False)
    is_hot_held = models.BooleanField(default=False)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)
    safe_until = models.DateTimeField(help_text="Timestamp after which the food must not be redistributed.")
    danger_zone_minutes_elapsed = models.PositiveIntegerField(default=0)

    estimated_cost_saved = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    estimated_co2e_saved_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    discarded_reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="surplus_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["safe_until"]
        indexes = [models.Index(fields=["status", "safe_until"])]

    def __str__(self):
        return f"{self.food_name} - {self.quantity}{self.unit} ({self.status})"

    def clean(self):
        if self.quantity_remaining is not None and self.quantity is not None:
            if self.quantity_remaining > self.quantity:
                raise ValidationError("Quantity remaining cannot exceed total quantity.")

    def save(self, *args, **kwargs):
        if self.quantity_remaining is None:
            self.quantity_remaining = self.quantity
        if not self.safe_until:
            self.safe_until = self._calculate_safe_until()
        self.full_clean(exclude=None)
        super().save(*args, **kwargs)

    def _calculate_safe_until(self):
        rule = self.safety_rule
        if self.is_refrigerated:
            minutes = rule.max_hold_minutes_cold
        elif self.is_hot_held:
            minutes = rule.max_hold_minutes_hot
        else:
            minutes = rule.max_hold_minutes_danger_zone
        return self.prepared_at + timedelta(minutes=minutes)

    @property
    def is_safe(self):
        return self.status not in (self.Status.EXPIRED, self.Status.DISCARDED) and timezone.now() < self.safe_until

    @property
    def time_remaining(self):
        remaining = self.safe_until - timezone.now()
        return max(remaining, timedelta(0))

    def mark_expired_if_needed(self):
        if self.is_safe:
            return False
        if self.status not in (self.Status.PICKED_UP, self.Status.DISCARDED):
            self.status = self.Status.EXPIRED
            self.discarded_reason = self.discarded_reason or "Exceeded safe time-temperature window."
            self.save(update_fields=["status", "discarded_reason", "updated_at"])
        return True

    def record_temperature(self, temperature_c, recorded_by=None):
        """Logs a temperature reading and re-evaluates cumulative danger-zone exposure."""
        self.current_temperature_c = temperature_c
        log = TemperatureLog.objects.create(
            surplus_food=self, temperature_c=temperature_c, recorded_by=recorded_by
        )
        rule = self.safety_rule
        if rule.danger_zone_min_c <= temperature_c <= rule.danger_zone_max_c:
            elapsed_since_last = 0
            recent_logs = list(self.temperature_logs.order_by("-recorded_at")[:2])
            if len(recent_logs) == 2:
                elapsed_since_last = int((recent_logs[0].recorded_at - recent_logs[1].recorded_at).total_seconds() / 60)
            self.danger_zone_minutes_elapsed += elapsed_since_last
            if self.danger_zone_minutes_elapsed >= rule.max_hold_minutes_danger_zone:
                self.status = self.Status.EXPIRED
                self.discarded_reason = "Cumulative danger-zone time exceeded safe limit."
        self.save()
        return log


class TemperatureLog(models.Model):
    surplus_food = models.ForeignKey(SurplusFood, on_delete=models.CASCADE, related_name="temperature_logs")
    temperature_c = models.DecimalField(max_digits=5, decimal_places=1)
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.surplus_food.food_name}: {self.temperature_c}C @ {self.recorded_at:%Y-%m-%d %H:%M}"
