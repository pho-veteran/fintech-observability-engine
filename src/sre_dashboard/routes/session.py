"""Session routes — manage AWS SSO profile lifecycle.

POST /api/session   — log in with a profile
GET  /api/session   — get current session info
DELETE /api/session — log out
POST /api/session/refresh — refresh current session
GET  /api/profiles  — list available AWS profiles
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from sre_dashboard.services.aws_client import AwsClientFactory
from sre_dashboard.services.dynamodb import DynamoDbService
from sre_dashboard.services.metrics import MetricsService
from sre_dashboard.services.session import SessionManager

router = APIRouter()


class LoginRequest(BaseModel):
    profile: str | None = None
    region: str = "us-east-1"


@router.get("/api/profiles")
async def list_profiles(request: Request):
    mgr: SessionManager = request.app.state.session_manager
    return mgr.list_profiles()


@router.post("/api/session")
async def login(body: LoginRequest, request: Request):
    mgr: SessionManager = request.app.state.session_manager
    result = mgr.login(profile=body.profile, region=body.region)
    if result.get("status") == "ok":
        tf_outputs = request.app.state.terraform_discovery.discover()
        if not isinstance(tf_outputs, dict):
            tf_outputs = {}
        request.app.state.aws_client_factory = AwsClientFactory(
            region=result.get("region") or body.region,
            profile=result.get("profile") or body.profile,
        )
        request.app.state.dynamodb_service = DynamoDbService(
            audit_table_name=tf_outputs.get("audit_table_name") or request.app.state.settings.audit_table_name,
            policy_table_name=tf_outputs.get("policy_table_name") or request.app.state.settings.policy_table_name,
            region=result.get("region") or body.region,
            profile=result.get("profile") or body.profile,
        )
        request.app.state.metrics_service = MetricsService(
            aws_client_factory=request.app.state.aws_client_factory,
            amp_query_endpoint=tf_outputs.get("amp_query_endpoint") or tf_outputs.get("amp_workspace_url"),
        )
    return result


@router.get("/api/session")
async def get_session(request: Request):
    mgr: SessionManager = request.app.state.session_manager
    return mgr.get_state()


@router.delete("/api/session")
async def logout(request: Request):
    mgr: SessionManager = request.app.state.session_manager
    return mgr.logout()


@router.post("/api/session/refresh")
async def refresh_session(request: Request):
    mgr: SessionManager = request.app.state.session_manager
    return mgr.refresh()
