"""Tests for TerraformDiscovery."""

from __future__ import annotations

import json

from sre_dashboard.services.terraform import TerraformDiscovery


# ── Cached output file ──────────────────────────────────────────


def test_reads_cached_output(tmp_path):
    """Reads terraform-output.json when present."""
    cache = tmp_path / "terraform-output.json"
    cache.write_text(json.dumps({
        "amp_query_endpoint": {"value": "https://aps.aws.com/ws-123", "type": "string"},
        "sqs_queue_url": {"value": "https://sqs.aws.com/123/cdo-queue", "type": "string"},
    }))

    result = TerraformDiscovery(output_dir=str(tmp_path)).discover()

    assert result["amp_query_endpoint"] == "https://aps.aws.com/ws-123"
    assert result["sqs_queue_url"] == "https://sqs.aws.com/123/cdo-queue"


def test_cached_output_flat_json(tmp_path):
    """Handles flat JSON (without Terraform's {value, type} wrapper)."""
    cache = tmp_path / "terraform-output.json"
    cache.write_text(json.dumps({
        "amp_query_endpoint": "https://aps.aws.com/ws-456",
    }))

    result = TerraformDiscovery(output_dir=str(tmp_path)).discover()
    assert result["amp_query_endpoint"] == "https://aps.aws.com/ws-456"


def test_no_output_file(tmp_path):
    """When no output file exists, returns empty dict."""
    result = TerraformDiscovery(output_dir=str(tmp_path)).discover()
    assert result == {}


def test_invalid_output_file(tmp_path):
    """When cache JSON is invalid, returns empty dict."""
    (tmp_path / "terraform-output.json").write_text("{")
    result = TerraformDiscovery(output_dir=str(tmp_path)).discover()
    assert result == {}
