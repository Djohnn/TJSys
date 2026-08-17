def normalize_reason(reason: str | None) -> str:
    """Return the canonical reason or reject a missing/whitespace-only value."""
    normalized = reason.strip() if reason is not None else ''
    if not normalized:
        raise ValueError('Reason is required.')
    return normalized
