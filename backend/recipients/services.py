from pickups.models import PickupMatchLog

from .models import Recipient


def find_matches_for_surplus(surplus_food, limit=5):
    """
    Ranks active, verified recipients whose capacity can accommodate the
    given surplus item, matching capacity_unit to surplus_food.unit.

    Scoring: recipients with capacity closest to (but >= ) the available
    quantity rank highest — this avoids matching a small donation to a
    recipient with far more capacity than needed, leaving little for
    smaller-capacity recipients elsewhere.

    Does not create a Pickup. Logs every candidate considered to
    PickupMatchLog for audit purposes, and marks the top-ranked one as
    was_selected=True.
    """
    quantity_needed = surplus_food.quantity_remaining

    eligible = Recipient.objects.filter(
        is_active=True,
        user__is_verified=True,
        capacity_unit=surplus_food.unit,
        capacity_quantity__gte=quantity_needed,
    ).select_related("user")

    scored = []
    for recipient in eligible:
        excess = recipient.capacity_quantity - quantity_needed
        score = 1 / (1 + float(excess))
        scored.append((recipient, score))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    top_matches = scored[:limit]

    logs = []
    for index, (recipient, score) in enumerate(top_matches):
        logs.append(
            PickupMatchLog.objects.create(
                surplus_food=surplus_food,
                recipient=recipient,
                score=score,
                was_selected=(index == 0),
                reason="Ranked by closest sufficient capacity." if index == 0 else "Candidate match.",
            )
        )

    return top_matches