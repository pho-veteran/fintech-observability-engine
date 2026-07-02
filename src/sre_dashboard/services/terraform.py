"""Terraform output discovery — reads a generated terraform-output.json file.

Used to discover CDO infrastructure resource IDs (AMP workspace, SQS queues, etc.)
from a local cache file created with `terraform output -json`.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("sre_dashboard.terraform")


class TerraformDiscovery:
    """Discovers CDO infrastructure outputs from a local Terraform output cache."""

    def __init__(self, output_dir: str) -> None:
        self._output_dir = Path(output_dir)

    def discover(self) -> dict[str, Any]:
        """Discover Terraform outputs.

        Returns a dict of Terraform output values. Each key maps to the
        ``value`` field from Terraform's JSON output format.

        Returns an empty dict if discovery fails.
        """
        result = self._read_cached_output()
        if result is not None:
            return result
        logger.warning("No terraform-output.json cache file available")
        return {}

    def _read_cached_output(self) -> dict[str, Any] | None:
        """Read a generated ``terraform-output.json`` from the output directory."""
        cache_file = self._output_dir / "terraform-output.json"
        if not cache_file.is_file():
            return None
        try:
            parsed: dict[str, Any] = json.loads(cache_file.read_text())
            return {k: v.get("value") if isinstance(v, dict) and "value" in v else v
                    for k, v in parsed.items()}
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read cached terraform output: %s", exc)
            return None
