import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Recipient(models.Model):
    """
    A recipient organization (NGO / shelter / etc.) that can be matched to
    and receive surplus food. One-to-one with a User whose role is
    RECIPIENT_ORG. Verification (`user.is_verified`) is managed by admins
    via the accounts app, not here.
    """

    class Unit(models.TextChoices):
        KG = "KG", "Kilograms"
        LITRE = "LITRE", "Litres"
        PORTION = "PORTION", "Portions / servings"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recipient_profile",
        limit_choices_to={"role": "RECIPIENT_ORG"},
    )

    # Matching capacity: how much this recipient can currently accept.
    capacity_quantity = models.DecimalField(
        max_digits=8, decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Max quantity this recipient can accept per pickup/day, in `capacity_unit`.",
    )
    capacity_unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.KG)

    is_active = models.BooleanField(
        default=True,
        help_text="Recipient opts out of matching (e.g. temporarily full) without losing account access.",
    )

    address = models.CharField(max_length=255, blank=True)
    contact_person = models.CharField(max_length=150, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["is_active"])]

    def __str__(self):
        return f"{self.user.organization_name or self.user.username}"

    def clean(self):
        if self.user_id and self.user.role != "RECIPIENT_ORG":
            raise ValidationError("Linked user must have role RECIPIENT_ORG.")

    def save(self, *args, **kwargs):
        self.full_clean(exclude=None)
        super().save(*args, **kwargs)

    @property
    def is_verified(self):
        """Proxies accounts.User.is_verified — verification is admin-managed, not stored here."""
        return self.user.is_verified

    @property
    def is_available_for_matching(self):
        return self.is_active and self.is_verified

    @property
    def organization_name(self):
        return self.user.organization_name

    @property
    def phone_number(self):
        return self.user.phone_number