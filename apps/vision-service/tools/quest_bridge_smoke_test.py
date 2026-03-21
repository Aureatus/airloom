from __future__ import annotations

import argparse
import json
import ssl
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test a running Incantation Quest Bridge")
    parser.add_argument("--url", help="bridge base URL, for example https://127.0.0.1:38419/")
    parser.add_argument(
        "--frames",
        type=int,
        default=8,
        help="number of synthetic frames to post once the bridge responds",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="skip TLS verification for self-signed local certificates",
    )
    return parser.parse_args()


def _request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    insecure: bool,
) -> Any:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    context = ssl._create_unverified_context() if insecure else None
    with urlopen(request, context=context, timeout=2.5) as response:
        raw = response.read()
        if not raw:
            return None
        return json.loads(raw)


def _hand(center_x: float, *, handedness: str, pinch: bool = False) -> dict[str, object]:
    wrist_y = 0.82
    mcp_y = 0.7
    pip_y = 0.54
    tip_y = 0.3
    thumb_tip_x = center_x - 0.12 if handedness == "right" else center_x + 0.12
    index_tip_x = center_x - 0.05 if handedness == "right" else center_x + 0.05
    if pinch:
        thumb_tip_x = index_tip_x
        tip_y = 0.38

    landmarks = [
        {"x": center_x, "y": wrist_y},
        {"x": center_x - 0.06, "y": 0.72},
        {"x": center_x - 0.09, "y": 0.61},
        {"x": center_x - 0.11, "y": 0.49},
        {"x": thumb_tip_x, "y": 0.39 if pinch else 0.47},
        {"x": center_x - 0.08, "y": mcp_y},
        {"x": center_x - 0.07, "y": pip_y},
        {"x": center_x - 0.06, "y": 0.41},
        {"x": index_tip_x, "y": tip_y},
        {"x": center_x - 0.02, "y": mcp_y},
        {"x": center_x - 0.01, "y": pip_y},
        {"x": center_x, "y": 0.4},
        {"x": center_x + 0.01, "y": 0.26},
        {"x": center_x + 0.04, "y": mcp_y},
        {"x": center_x + 0.05, "y": pip_y},
        {"x": center_x + 0.06, "y": 0.43},
        {"x": center_x + 0.07, "y": 0.32},
        {"x": center_x + 0.1, "y": mcp_y},
        {"x": center_x + 0.11, "y": pip_y},
        {"x": center_x + 0.12, "y": 0.48},
        {"x": center_x + 0.13, "y": 0.38},
    ]
    return {
        "handedness": handedness,
        "confidence": 0.95,
        "landmarks": landmarks,
    }


def _frame(index: int) -> dict[str, object]:
    pinch = index % 2 == 0
    return {
        "timestampMs": index * 16,
        "hands": [
            _hand(0.68, handedness="right"),
            _hand(0.32, handedness="left", pinch=pinch),
        ],
    }


def main() -> int:
    args = _parse_args()
    candidate_urls = (
        [args.url] if args.url else ["https://127.0.0.1:38419/", "http://127.0.0.1:38419/"]
    )

    base_url: str | None = None
    insecure = args.insecure
    status_payload: dict[str, object] | None = None

    for candidate in candidate_urls:
        if candidate is None:
            continue
        try:
            insecure = args.insecure or candidate.startswith("https://")
            status = _request_json(
                f"{candidate.rstrip('/')}/api/status",
                insecure=insecure,
            )
            if isinstance(status, dict):
                base_url = candidate.rstrip("/") + "/"
                status_payload = status
                break
        except (HTTPError, URLError, ValueError):
            continue

    if base_url is None or status_payload is None:
        print("Quest Bridge did not answer on the default URLs.")
        print("Start Incantation with trackingBackend=quest-bridge, then rerun this command.")
        return 1

    print(f"Quest Bridge reachable at {base_url}")
    print(f"- advertised URL: {status_payload.get('bridgeUrl', 'unknown')}")
    print(f"- TLS enabled: {status_payload.get('tlsEnabled', False)}")

    for index in range(max(1, args.frames)):
        _request_json(
            f"{base_url.rstrip('/')}/api/frame",
            method="POST",
            payload=_frame(index),
            insecure=insecure,
        )
        time.sleep(0.03)

    print("Posted synthetic Quest frames successfully.")
    print("Now check the Incantation calibration view for bridgeConnected=true and handsTracked>0.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
