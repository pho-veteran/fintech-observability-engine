"""Audit log routes.

GET /api/audits?tenant_id=...&service_id=...&limit=50
"""

from __future__ import annotations

import asyncio
import base64
import json

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter()


def _decode_cursor(cursor: str | None) -> dict | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid audit pagination cursor") from exc


def _encode_cursor(cursor: dict | None) -> str | None:
    if not cursor:
        return None
    raw = json.dumps(cursor, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


@router.get("/api/audits")
async def list_audits(
    request: Request,
    tenant_id: str = Query(..., description="Tenant ID to filter audits by"),
    service_id: str | None = Query(None, description="Optional service name filter"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of audit records to return"),
    cursor: str | None = Query(None, description="Opaque pagination cursor"),
    page: int = Query(0, ge=0, le=200, description="Zero-based page number for direct navigation"),
):
    """Query audit logs for a tenant, optionally filtered by service."""
    ddb = request.app.state.dynamodb_service
    records, next_key = await asyncio.to_thread(
        ddb.query_audit_logs,
        tenant_id=tenant_id,
        service_id=service_id,
        limit=limit,
        cursor=_decode_cursor(cursor),
        page=page,
    )
    next_cursor = _encode_cursor(next_key)
    return {
        "tenant_id": tenant_id,
        "service_id": service_id,
        "page": page,
        "count": len(records),
        "records": records,
        "has_more": next_cursor is not None,
        "next_cursor": next_cursor,
    }
