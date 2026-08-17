from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Campus Admin"
        KITCHEN_STAFF = "KITCHEN_STAFF", "Kitchen Staff"
        WARDEN = "WARDEN", "Hostel Warden"
        RECIPIENT_ORG = "RECIPIENT_ORG", "Recipient Organization"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.KITCHEN_STAFF)
    phone_number = models.CharField(max_length=15, blank=True)
    organization_name = models.CharField(
        max_length=150, blank=True,
        help_text="Only used when role = RECIPIENT_ORG, e.g. NGO name"
    )
    is_verified = models.BooleanField(
        default=False,
        help_text="Recipient orgs must be verified by admin before they can claim surplus"
    )

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"