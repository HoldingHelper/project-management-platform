"""Shared CSV/Excel export helpers for analytics endpoints (`?format=`)."""

from __future__ import annotations

import csv
import io
from typing import Any, Sequence

from fastapi.responses import Response, StreamingResponse

from app.core.exceptions import ValidationAppError


def rows_to_csv_response(rows: Sequence[dict[str, Any]], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


def rows_to_xlsx_response(rows: Sequence[dict[str, Any]], filename: str) -> Response:
    try:
        from openpyxl import Workbook
    except ImportError as exc:  # pragma: no cover
        raise ValidationAppError("Excel export requires openpyxl on the server.") from exc

    wb = Workbook()
    ws = wb.active
    ws.title = filename[:31]
    if rows:
        headers = list(rows[0].keys())
        ws.append(headers)
        for row in rows:
            ws.append([_cell(row.get(h)) for h in headers])
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
    )


def _cell(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def maybe_export(rows: Sequence[dict[str, Any]], fmt: str | None, filename: str):
    """Returns a file response when fmt is csv/xlsx, else None (caller returns JSON)."""
    if fmt == "csv":
        return rows_to_csv_response(rows, filename)
    if fmt == "xlsx":
        return rows_to_xlsx_response(rows, filename)
    return None
