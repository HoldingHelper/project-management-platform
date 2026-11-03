"""Persian and English date / relative-time parser for the PMP Telegram module."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional


# Mapping Persian digits to standard ASCII digits
_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_digits(text: str) -> str:
    """Convert Persian/Arabic digits to standard ASCII digits."""
    return text.translate(_PERSIAN_DIGITS)


# Python weekday: Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4, Saturday=5, Sunday=6
_PERSIAN_WEEKDAYS = {
    "شنبه": 5,
    "يكشنبه": 6,
    "یکشنبه": 6,
    "دوشنبه": 0,
    "سه شنبه": 1,
    "سه‌شنبه": 1,
    "چهارشنبه": 2,
    "چهار شنبه": 2,
    "پنجشنبه": 3,
    "پنج شنبه": 3,
    "پنج‌شنبه": 3,
    "جمعه": 4,
}

_ENGLISH_WEEKDAYS = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}


def parse_relative_date(text: str, base_date: Optional[date] = None) -> Optional[date]:
    """Parse relative and natural date strings in Persian or English into a concrete date."""
    if not text:
        return None

    today = base_date or datetime.now(timezone.utc).date()
    normalized = normalize_digits(text.strip().lower())

    # Direct relative terms
    if normalized in ("امروز", "today"):
        return today
    if normalized in ("فردا", "tomorrow"):
        return today + timedelta(days=1)
    if normalized in ("پس‌فردا", "پس فردا", "day after tomorrow"):
        return today + timedelta(days=2)
    if normalized in ("هفته بعد", "هفته آینده", "next week"):
        return today + timedelta(days=7)
    if normalized in ("ماه بعد", "ماه آینده", "next month"):
        return today + timedelta(days=30)

    # In X days: "3 روز دیگر", "در ۳ روز", "in 3 days"
    in_days_match = re.search(r"(?:in\s+)?(\d+)\s*(?:days?|روز(?:\s*دیگر)?)", normalized)
    if in_days_match:
        days = int(in_days_match.group(1))
        return today + timedelta(days=days)

    # In X weeks: "2 هفته دیگر", "in 2 weeks"
    in_weeks_match = re.search(r"(?:in\s+)?(\d+)\s*(?:weeks?|هفته(?:\s*دیگر)?)", normalized)
    if in_weeks_match:
        weeks = int(in_weeks_match.group(1))
        return today + timedelta(days=weeks * 7)

    # Persian weekdays: e.g. "شنبه", "سه‌شنبه بعد", "یکشنبه آینده"
    is_next = any(keyword in normalized for keyword in ("بعد", "آینده", "دیگر", "next"))
    for name, target_wd in sorted(_PERSIAN_WEEKDAYS.items(), key=lambda x: len(x[0]), reverse=True):
        if name in normalized:
            current_wd = today.weekday()
            days_ahead = (target_wd - current_wd) % 7
            if days_ahead == 0 and is_next:
                days_ahead = 7
            elif days_ahead == 0 and "امروز" not in normalized:
                days_ahead = 7
            return today + timedelta(days=days_ahead)

    # English weekdays: e.g. "next Monday", "Tuesday", "this Friday"
    for name, target_wd in sorted(_ENGLISH_WEEKDAYS.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = rf"\b{name}\b"
        if re.search(pattern, normalized):
            current_wd = today.weekday()
            days_ahead = (target_wd - current_wd) % 7
            if days_ahead == 0 and (is_next or "next" in normalized):
                days_ahead = 7
            elif days_ahead == 0 and "today" not in normalized:
                days_ahead = 7
            return today + timedelta(days=days_ahead)

    # Explicit ISO format: YYYY-MM-DD or YYYY/MM/DD
    iso_match = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", normalized)
    if iso_match:
        try:
            y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
            return date(y, m, d)
        except ValueError:
            pass

    return None

