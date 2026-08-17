from django.db import models


class Campus(models.Model):
    """Each hostel/mess/campus location running its own meal service."""

    name = models.CharField(max_length=150, unique=True)
    location = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class AcademicCalendarEntry(models.Model):
    """
    One row per date. The ML team reads this to know if a date is a
    holiday or exam period — both strongly affect meal demand.
    """

    date = models.DateField(unique=True)
    is_holiday = models.BooleanField(default=False)
    is_exam_period = models.BooleanField(default=False)
    note = models.CharField(max_length=200, blank=True, help_text="e.g. 'Diwali break', 'Mid-sem exams'")

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.date} (holiday={self.is_holiday}, exam={self.is_exam_period})"


class SystemConfig(models.Model):
    """
    Single-row table for org-wide safety/config values. Backend dev 2's
    surplus app reads max_storage_hours to flag unsafe redistribution.
    """

    max_storage_hours = models.PositiveIntegerField(
        default=4,
        help_text="Max hours food can sit before it's unsafe to redistribute"
    )
    min_storage_temp_celsius = models.DecimalField(max_digits=4, decimal_places=1, default=4.0)
    max_storage_temp_celsius = models.DecimalField(max_digits=4, decimal_places=1, default=60.0)

    class Meta:
        verbose_name = "System Configuration"
        verbose_name_plural = "System Configuration"

    def __str__(self):
        return "System Configuration"

    def save(self, *args, **kwargs):
        # enforce single row — there should only ever be one SystemConfig
        self.pk = 1
        super().save(*args, **kwargs)