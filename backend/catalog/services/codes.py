def validate_gtin(value: str) -> bool:
    if not value.isdigit() or len(value) not in {8, 12, 13, 14}:
        return False
    digits = [int(item) for item in value]
    total = sum(
        digit * (3 if index % 2 == 0 else 1) for index, digit in enumerate(reversed(digits[:-1]))
    )
    return (10 - total % 10) % 10 == digits[-1]
