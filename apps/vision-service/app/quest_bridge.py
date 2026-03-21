from __future__ import annotations

import json
import os
import ssl
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Condition, Lock, Thread
from typing import Any, cast

from app.gestures import GestureMachine
from app.protocol import empty_capture_counts
from app.quest_tracking import QuestTracker


def _env_value(name: str, legacy_name: str, default: str) -> str:
    return os.environ.get(name) or os.environ.get(legacy_name, default)


def _quest_static_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "web" / "quest-bridge"


def _build_bridge_url(port: int, tls_enabled: bool) -> str:
    scheme = "https" if tls_enabled else "http"
    return f"{scheme}://localhost:{port}/"


def _resolve_bridge_urls(port: int, tls_enabled: bool) -> tuple[str, list[str]]:
    recommended = os.environ.get("INCANTATION_QUEST_RECOMMENDED_URL") or os.environ.get(
        "AIRLOOM_QUEST_RECOMMENDED_URL"
    )
    raw_candidates = os.environ.get("INCANTATION_QUEST_CANDIDATE_URLS") or os.environ.get(
        "AIRLOOM_QUEST_CANDIDATE_URLS"
    )

    candidate_urls: list[str] = []
    if raw_candidates:
        try:
            decoded = json.loads(raw_candidates)
            if isinstance(decoded, list):
                candidate_urls = [value for value in decoded if isinstance(value, str)]
        except json.JSONDecodeError:
            candidate_urls = []

    bridge_url = recommended if isinstance(recommended, str) and recommended else None
    if bridge_url is None:
        bridge_url = candidate_urls[0] if candidate_urls else _build_bridge_url(port, tls_enabled)

    if bridge_url not in candidate_urls:
        candidate_urls = [bridge_url, *candidate_urls]

    return (bridge_url, candidate_urls)


def emit_capture_state(emit_event: Any) -> None:
    emit_event(
        {
            "type": "capture.state",
            "sessionId": "quest-bridge",
            "activeLabel": "neutral",
            "recording": False,
            "takeCount": 0,
            "counts": empty_capture_counts(),
            "lastTakeId": None,
            "exportPath": None,
            "message": "Capture export is unavailable for Quest Bridge.",
        }
    )


@dataclass(slots=True)
class QuestBridgeState:
    bridge_url: str
    bridge_urls: list[str]
    tls_enabled: bool
    heartbeat_timeout_s: float
    _latest_payload: dict[str, object] | None = None
    _latest_version: int = 0
    _last_frame_at: float = 0.0
    _ever_connected: bool = False
    _lock: Lock = field(default_factory=Lock)
    _condition: Condition = field(init=False)

    def __post_init__(self) -> None:
        self._condition = Condition(self._lock)

    def publish(self, payload: dict[str, object], *, now: float) -> None:
        with self._condition:
            self._latest_version += 1
            enriched = dict(payload)
            enriched["bridge_connected"] = True
            enriched["bridge_url"] = self.bridge_url
            self._latest_payload = enriched
            self._last_frame_at = now
            self._ever_connected = True
            self._condition.notify_all()

    def wait_for_update(
        self, last_version: int, *, timeout: float
    ) -> tuple[int, dict[str, object]] | None:
        with self._condition:
            if self._latest_version <= last_version:
                self._condition.wait(timeout)
            if self._latest_version <= last_version or self._latest_payload is None:
                return None
            return (self._latest_version, dict(self._latest_payload))

    def connection_snapshot(self, *, now: float) -> tuple[bool, bool]:
        with self._lock:
            connected = (
                self._ever_connected and (now - self._last_frame_at) <= self.heartbeat_timeout_s
            )
            return (connected, self._ever_connected)


class QuestBridgeRequestHandler(BaseHTTPRequestHandler):
    def _quest_server(self) -> QuestBridgeHttpServer:
        return cast(QuestBridgeHttpServer, self.server)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in {"/", "/index.html"}:
            self._serve_static("index.html", "text/html; charset=utf-8")
            return
        if self.path == "/client.js":
            self._serve_static("client.js", "application/javascript; charset=utf-8")
            return
        if self.path == "/api/status":
            quest_server = self._quest_server()
            self._write_json(
                {
                    "bridgeUrl": quest_server.bridge_state.bridge_url,
                    "candidateUrls": quest_server.bridge_state.bridge_urls,
                    "tlsEnabled": quest_server.tls_enabled,
                }
            )
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/frame":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = self.headers.get("Content-Length")
        if content_length is None:
            self.send_error(HTTPStatus.LENGTH_REQUIRED)
            return

        try:
            body = self.rfile.read(int(content_length))
            payload = json.loads(body)
        except (ValueError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST)
            return

        if not isinstance(payload, dict):
            self.send_error(HTTPStatus.BAD_REQUEST)
            return

        self._quest_server().bridge_state.publish(
            cast(dict[str, object], payload), now=time.monotonic()
        )
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        del format, args
        return

    def _serve_static(self, name: str, content_type: str) -> None:
        path = self._quest_server().static_dir / name
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def _write_json(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class QuestBridgeHttpServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address: tuple[str, int],
        handler_class: type[BaseHTTPRequestHandler],
        *,
        bridge_state: QuestBridgeState,
        static_dir: Path,
        tls_enabled: bool,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.bridge_state = bridge_state
        self.static_dir = static_dir
        self.tls_enabled = tls_enabled


def create_quest_bridge_server(port: int) -> QuestBridgeHttpServer:
    cert_path = os.environ.get("INCANTATION_QUEST_TLS_CERT") or os.environ.get(
        "AIRLOOM_QUEST_TLS_CERT"
    )
    key_path = os.environ.get("INCANTATION_QUEST_TLS_KEY") or os.environ.get(
        "AIRLOOM_QUEST_TLS_KEY"
    )
    tls_enabled = bool(cert_path and key_path)
    bridge_url, bridge_urls = _resolve_bridge_urls(port, tls_enabled)
    bridge_state = QuestBridgeState(
        bridge_url=bridge_url,
        bridge_urls=bridge_urls,
        tls_enabled=tls_enabled,
        heartbeat_timeout_s=float(
            _env_value(
                "INCANTATION_QUEST_HEARTBEAT_TIMEOUT_MS",
                "AIRLOOM_QUEST_HEARTBEAT_TIMEOUT_MS",
                "800",
            )
        )
        / 1000.0,
    )
    server = QuestBridgeHttpServer(
        ("0.0.0.0", port),
        QuestBridgeRequestHandler,
        bridge_state=bridge_state,
        static_dir=_quest_static_dir(),
        tls_enabled=tls_enabled,
    )
    if tls_enabled:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cast(str, cert_path), keyfile=cast(str, key_path))
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def run_quest_bridge(
    max_frames: int,
    *,
    emit_event: Any,
    time_source: Any = time.monotonic,
    sleep_for: Any = time.sleep,
    tracker_factory: Any = QuestTracker,
    machine_factory: Any = GestureMachine,
    server_factory: Any | None = None,
) -> None:
    emit_capture_state(emit_event)

    port = int(_env_value("INCANTATION_QUEST_BRIDGE_PORT", "AIRLOOM_QUEST_BRIDGE_PORT", "8443"))
    server_builder = server_factory or create_quest_bridge_server
    server = server_builder(port)
    tracker = tracker_factory()
    machine = machine_factory()
    processed = 0
    last_seen_version = 0
    last_fallback_reason: str | None = None

    thread = Thread(target=server.serve_forever, name="incantation-quest-bridge", daemon=True)
    thread.start()

    try:
        while not max_frames or processed < max_frames:
            update = server.bridge_state.wait_for_update(last_seen_version, timeout=0.05)
            if update is not None:
                last_seen_version, payload = update
                frame_state = tracker.process(payload)
                for event in machine.update(frame_state):
                    emit_event(event)
                last_fallback_reason = frame_state.get("fallback_reason")
                processed += 1
                continue

            connected, ever_connected = server.bridge_state.connection_snapshot(now=time_source())
            fallback_reason = (
                "bridge-disconnected" if ever_connected else "bridge-awaiting-connection"
            )
            if connected:
                fallback_reason = "no-hands"
            if fallback_reason == last_fallback_reason:
                sleep_for(0.05)
                continue

            frame_state = tracker.process(
                {
                    "hands": [],
                    "bridge_connected": connected,
                    "bridge_url": server.bridge_state.bridge_url,
                }
            )
            frame_state["fallback_reason"] = fallback_reason
            for event in machine.update(frame_state):
                emit_event(event)
            last_fallback_reason = fallback_reason
            processed += 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1.0)
