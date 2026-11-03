"""Unit tests for Telegram date and relative-time parsing in Persian and English."""

from __future__ import annotations

from datetime import date, timedelta
import pytest

from app.modules.telegram.dates import (
    normalize_digits,
    parse_relative_date,
)


def test_digit_normalization():
    assert normalize_digits("۰۱۲۳۴۵۶۷۸۹") == "0123456789"
    assert normalize_digits("تسک ۱۴۲") == "تسک 142"
    assert normalize_digits("sprint ۵") == "sprint 5"


def test_relative_date_persian():
    base = date(2026, 11, 1)  # Sunday (weekday index 6)

    assert parse_relative_date("امروز", base_date=base) == base
    assert parse_relative_date("فردا", base_date=base) == base + timedelta(days=1)
    assert parse_relative_date("پس‌فردا", base_date=base) == base + timedelta(days=2)
    assert parse_relative_date("پس فردا", base_date=base) == base + timedelta(days=2)
    assert parse_relative_date("هفته بعد", base_date=base) == base + timedelta(days=7)
    assert parse_relative_date("ماه بعد", base_date=base) == base + timedelta(days=30)
    assert parse_relative_date("۳ روز دیگر", base_date=base) == base + timedelta(days=3)


def test_relative_date_persian_weekdays():
    # Base is Sunday, Nov 1, 2026 (weekday=6)
    base = date(2026, 11, 1)

    # Next Monday (دوشنبه, weekday=0) is Nov 2
    assert parse_relative_date("دوشنبه", base_date=base) == date(2026, 11, 2)

    # Next Tuesday (سه‌شنبه, weekday=1) is Nov 3
    assert parse_relative_date("سه‌شنبه", base_date=base) == date(2026, 11, 3)
    assert parse_relative_date("سه شنبه", base_date=base) == date(2026, 11, 3)

    # Next Saturday (شنبه, weekday=5) is Nov 7
    assert parse_relative_date("شنبه", base_date=base) == date(2026, 11, 7)


def test_relative_date_english():
    base = date(2026, 11, 1)  # Sunday

    assert parse_relative_date("today", base_date=base) == base
    assert parse_relative_date("tomorrow", base_date=base) == base + timedelta(days=1)
    assert parse_relative_date("day after tomorrow", base_date=base) == base + timedelta(days=2)
    assert parse_relative_date("next week", base_date=base) == base + timedelta(days=7)
    assert parse_relative_date("in 5 days", base_date=base) == base + timedelta(days=5)
    assert parse_relative_date("next Monday", base_date=base) == date(2026, 11, 2)
    assert parse_relative_date("next Tuesday", base_date=base) == date(2026, 11, 3)


def test_iso_date_format():
    assert parse_relative_date("2026-11-20") == date(2026, 11, 20)
    assert parse_relative_date("2026/12/05") == date(2026, 12, 5)
    assert parse_relative_date("invalid date") is None

