from django.db import models


class MealSession(models.Model):
    """Breakfast, lunch, dinner, snacks — the fixed slots each day."""

    class SessionType(models.TextChoices):
        BREAKFAST = "BREAKFAST", "Breakfast"
        LUNCH = "LUNCH", "Lunch"
        SNACKS = "SNACKS", "Snacks"
        DINNER = "DINNER", "Dinner"

    name = models.CharField(max_length=20, choices=SessionType.choices, unique=True)
    start_time = models.TimeField()
    end_time = models.TimeField()

    def __str__(self):
        return self.get_name_display()


class MenuItem(models.Model):
    """A dish that can appear on the menu."""

    class Category(models.TextChoices):
        MAIN = "MAIN", "Main Course"
        SIDE = "SIDE", "Side Dish"
        BEVERAGE = "BEVERAGE", "Beverage"
        DESSERT = "DESSERT", "Dessert"

    name = models.CharField(max_length=150)
    category = models.CharField(max_length=20, choices=Category.choices)
    cost_per_kg = models.DecimalField(max_digits=8, decimal_places=2, help_text="Cost in ₹ per kg, used for savings calc")
    carbon_factor_kg_co2e_per_kg = models.DecimalField(
        max_digits=6, decimal_places=3, default=0,
        help_text="kg CO2e emitted per kg of this food item, used for carbon savings calc"
    )

    def __str__(self):
        return self.name


class MealConsumptionLog(models.Model):
    """
    The core record: for a given date + session + item, how much was
    prepared vs how much was actually consumed. This is what the ML
    team trains the demand forecast model on.
    """

    date = models.DateField()
    session = models.ForeignKey(MealSession, on_delete=models.CASCADE, related_name="logs")
    item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="logs")

    quantity_prepared_kg = models.DecimalField(max_digits=8, decimal_places=2)
    quantity_consumed_kg = models.DecimalField(max_digits=8, decimal_places=2)
    headcount = models.PositiveIntegerField(help_text="Number of people served this session")

    # Optional context fields — useful once the ML dev wants to factor these in
    is_holiday = models.BooleanField(default=False)
    is_exam_period = models.BooleanField(default=False)
    weather_note = models.CharField(max_length=50, blank=True, help_text="e.g. 'rainy', 'heatwave' — optional for now")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("date", "session", "item")
        ordering = ["-date"]

    @property
    def surplus_kg(self):
        return self.quantity_prepared_kg - self.quantity_consumed_kg

    def __str__(self):
        return f"{self.date} | {self.session} | {self.item} | prepared {self.quantity_prepared_kg}kg"