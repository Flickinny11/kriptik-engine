"""Preview server for Prism pipeline.

Serves assembled PixiJS bundles via Modal HTTPS tunnel.
Supports hot-reload for single-node edits.

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 16 — Live Preview via Modal Tunnel
  - Assembly phase produces a complete bundle directory
  - Modal function starts a lightweight dev server
  - Modal tunnel exposes the dev server via HTTPS URL
  - URL returned to client via prism_preview_ready SSE event
  - For edits: only changed node code regenerates, dev server hot-reloads

R2 path convention for bundles:
  {projectId}/{graphVersion}/bundles/frontend/

Hot-reload uses SSE (Server-Sent Events) per Invariant 5:
  SSE is the ONLY real-time channel. No WebSockets. No polling.
"""

import json
import logging
import mimetypes
import os
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global state for hot-reload SSE
# ---------------------------------------------------------------------------

_hot_reload_events: list[dict] = []
_hot_reload_lock = threading.Lock()

# Connected SSE clients waiting for hot-reload events.
# Each entry is a threading.Event that gets set when a new reload event arrives.
_hot_reload_waiters: list[threading.Event] = []
_hot_reload_waiters_lock = threading.Lock()

# The bundle directory the handler serves files from.
# Set by start_preview_server before the HTTPServer starts.
_bundle_directory: Optional[str] = None

# Base output directory for multi-project serving.
# When set, the server resolves bundles by path: /{projectId}/{version}/...
# maps to {_output_root}/{projectId}/{version}/bundles/frontend/...
_output_root: Optional[str] = None


# ---------------------------------------------------------------------------
# MIME type setup
# ---------------------------------------------------------------------------

# Ensure common web types are registered (some minimal Python installs lack them)
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/ttf", ".ttf")


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------


class PrismPreviewHandler(SimpleHTTPRequestHandler):
    """HTTP handler for serving Prism bundles.

    Serves static files from the bundle directory.
    Adds CORS headers for iframe embedding in the Kriptik builder.
    Supports hot-reload via Server-Sent Events at /api/hot-reload.
    """

    # Silence per-request logging in production; use logger instead.
    def log_message(self, format: str, *args) -> None:
        logger.debug("HTTP %s", format % args)

    def end_headers(self) -> None:
        """Add CORS and cache headers.

        CORS is required because the Kriptik builder embeds the preview
        in an iframe from a different origin (the Modal tunnel URL).
        Cache-Control: no-cache ensures edits are visible immediately.
        """
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

    def do_GET(self) -> None:
        """Handle GET requests.

        Special routes:
        - /api/hot-reload: SSE stream for hot-reload notifications
        - /api/health: Health check endpoint
        - Everything else: static file serving from bundle directory
        """
        if self.path == "/api/hot-reload":
            self._handle_hot_reload_sse()
        elif self.path == "/api/health":
            self._handle_health()
        else:
            self._handle_static()

    # ----- Special routes -----

    def _handle_health(self) -> None:
        """Return a JSON health check response."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        payload = json.dumps({
            "status": "ok",
            "bundlePath": _bundle_directory,
            "eventCount": len(_hot_reload_events),
            "timestamp": _iso_now(),
        })
        self.wfile.write(payload.encode("utf-8"))

    def _handle_hot_reload_sse(self) -> None:
        """Stream hot-reload events via Server-Sent Events.

        Per Invariant 5: SSE is the ONLY real-time channel.

        The client connects to this endpoint and receives an SSE event
        whenever a node is updated. The event payload contains the node ID
        and a cache-busting timestamp so the client can reload just the
        changed module.

        Protocol:
          - On connect: send all existing events (catch-up)
          - Then: block until new events arrive, send them as they come
          - Connection stays open until client disconnects or server shuts down
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        # Track how many events this client has already seen.
        seen_count = 0

        # Send any events that already exist (catch-up for late-connecting clients).
        with _hot_reload_lock:
            for event in _hot_reload_events:
                self._send_sse_event(event)
            seen_count = len(_hot_reload_events)

        # Register a waiter so we get notified of new events.
        waiter = threading.Event()
        with _hot_reload_waiters_lock:
            _hot_reload_waiters.append(waiter)

        try:
            while True:
                # Wait for a new event (or timeout every 15s to send a keepalive).
                waiter.wait(timeout=15.0)
                waiter.clear()

                # Send any new events since last check.
                with _hot_reload_lock:
                    new_events = _hot_reload_events[seen_count:]
                    seen_count = len(_hot_reload_events)

                if new_events:
                    for event in new_events:
                        self._send_sse_event(event)
                else:
                    # Keepalive comment to detect broken connections.
                    try:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        break
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected.
            pass
        finally:
            with _hot_reload_waiters_lock:
                if waiter in _hot_reload_waiters:
                    _hot_reload_waiters.remove(waiter)

    def _send_sse_event(self, event: dict) -> None:
        """Write a single SSE event to the response stream.

        Format per SSE spec:
          event: <type>
          data: <json>
          \\n
        """
        try:
            event_type = event.get("type", "hot-reload")
            data = json.dumps(event)
            self.wfile.write(f"event: {event_type}\n".encode("utf-8"))
            self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            raise

    # ----- Static file serving -----

    def _handle_static(self) -> None:
        """Serve static files from the bundle directory.

        Supports two modes:
        1. Single-project: serves from _bundle_directory (set by start_preview_server)
        2. Multi-project: serves from _output_root, routing /{projectId}/{version}/...
           to {_output_root}/{projectId}/{version}/bundles/frontend/...

        Falls back to index.html for SPA routing (any path without a file
        extension that does not match a real file gets index.html).
        """
        bundle_root = self._resolve_bundle_root()
        if bundle_root is None:
            self.send_error(503, "Bundle directory not configured")
            return

        # Normalize path: strip leading slash, resolve relative components.
        request_path = self.path.split("?")[0].split("#")[0]
        request_path = request_path.lstrip("/")

        # In multi-project mode, strip the {projectId}/{version} prefix
        # since it was already used to resolve the bundle root.
        if _output_root and not _bundle_directory:
            parts = request_path.split("/", 2)
            # parts[0] = projectId, parts[1] = version, parts[2:] = file path
            request_path = parts[2] if len(parts) > 2 else ""

        if not request_path:
            request_path = "index.html"

        target = (bundle_root / request_path).resolve()

        # Security: ensure the resolved path is within the bundle directory.
        try:
            target.relative_to(bundle_root.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        # If the exact file exists, serve it.
        if target.is_file():
            self._serve_file(target)
            return

        # SPA fallback: if the path has no extension and is not a real file,
        # serve index.html so client-side routing can handle it.
        if "." not in target.name:
            index_path = bundle_root / "index.html"
            if index_path.is_file():
                self._serve_file(index_path)
                return

        self.send_error(404, "Not Found")

    def _resolve_bundle_root(self) -> Optional[Path]:
        """Resolve the bundle root directory for this request.

        In single-project mode, returns _bundle_directory.
        In multi-project mode, extracts {projectId}/{version} from the URL
        path and resolves to {_output_root}/{projectId}/{version}/bundles/frontend/.
        """
        if _bundle_directory:
            return Path(_bundle_directory)

        if not _output_root:
            return None

        request_path = self.path.split("?")[0].split("#")[0].lstrip("/")
        parts = request_path.split("/")

        if len(parts) < 2:
            return None

        project_id = parts[0]
        version = parts[1]

        bundle_dir = Path(_output_root) / project_id / version / "bundles" / "frontend"
        if bundle_dir.is_dir():
            return bundle_dir

        return None

    def _serve_file(self, file_path: Path) -> None:
        """Serve a single file with correct Content-Type."""
        content_type, _ = mimetypes.guess_type(str(file_path))
        if content_type is None:
            content_type = "application/octet-stream"

        try:
            content = file_path.read_bytes()
        except OSError as exc:
            logger.error("Failed to read %s: %s", file_path, exc)
            self.send_error(500, "Internal Server Error")
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def start_preview_server(
    bundle_path: str,
    port: int = 8080,
) -> str:
    """Start the preview server in single-project mode and return when ready.

    Starts an HTTPServer in a daemon thread so it does not block the
    calling Modal function. The Modal @web_server decorator handles
    tunnel creation -- this function just needs to bind to the port.

    Args:
        bundle_path: Absolute path to the assembled bundle directory.
                     Expected layout: index.html + JS/CSS/assets.
        port: Port to serve on (default 8080, matches Modal @web_server).

    Returns:
        The local URL string (e.g. "http://0.0.0.0:8080").
        Modal tunnel provides the external HTTPS URL automatically.

    Raises:
        FileNotFoundError: If bundle_path does not exist.
        FileNotFoundError: If bundle_path/index.html does not exist.
    """
    global _bundle_directory

    bundle_dir = Path(bundle_path)
    if not bundle_dir.is_dir():
        raise FileNotFoundError(
            f"Bundle directory does not exist: {bundle_path}"
        )

    index_file = bundle_dir / "index.html"
    if not index_file.is_file():
        raise FileNotFoundError(
            f"Bundle directory has no index.html: {bundle_path}"
        )

    _bundle_directory = str(bundle_dir.resolve())

    server = HTTPServer(("0.0.0.0", port), PrismPreviewHandler)

    server_thread = threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="prism-preview-server",
    )
    server_thread.start()

    local_url = f"http://0.0.0.0:{port}"
    logger.info(
        "Prism preview server started on %s (serving %s)",
        local_url,
        _bundle_directory,
    )

    return local_url


def start_preview_server_multi(
    output_root: str,
    port: int = 8080,
) -> str:
    """Start the preview server in multi-project mode.

    Serves bundles for ANY project via path routing:
      /{projectId}/{version}/... → {output_root}/{projectId}/{version}/bundles/frontend/...

    This is the mode used by the Modal @web_server function, which serves
    all projects from the shared /outputs volume.

    Args:
        output_root: Base directory containing all project outputs.
                     Expected layout: {output_root}/{projectId}/{version}/bundles/frontend/
        port: Port to serve on (default 8080, matches Modal @web_server).

    Returns:
        The local URL string (e.g. "http://0.0.0.0:8080").
    """
    global _output_root, _bundle_directory

    root = Path(output_root)
    if not root.is_dir():
        root.mkdir(parents=True, exist_ok=True)

    _output_root = str(root.resolve())
    _bundle_directory = None  # Multi-project mode: resolve per-request

    server = HTTPServer(("0.0.0.0", port), PrismPreviewHandler)

    server_thread = threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="prism-preview-server-multi",
    )
    server_thread.start()

    local_url = f"http://0.0.0.0:{port}"
    logger.info(
        "Prism preview server (multi-project) started on %s (root: %s)",
        local_url,
        _output_root,
    )

    return local_url


def notify_hot_reload(node_id: str, bundle_path: str) -> None:
    """Notify connected clients that a node has been updated.

    Called after a single-node edit completes. Sends an SSE event to all
    connected /api/hot-reload clients so the preview iframe can reload
    just the changed module without a full page refresh.

    Per spec Section 16: "For edits: only changed node code regenerates,
    dev server hot-reloads." The target is under 5 seconds for a single-
    node edit to appear in the preview.

    Args:
        node_id: The ID of the graph node whose code was regenerated.
        bundle_path: Path to the updated bundle directory (used by the
                     client to construct the module URL for cache busting).
    """
    event = {
        "type": "hot-reload",
        "nodeId": node_id,
        "bundlePath": bundle_path,
        "timestamp": _iso_now(),
        "cacheBuster": str(int(time.time() * 1000)),
    }

    with _hot_reload_lock:
        _hot_reload_events.append(event)

    # Wake up all waiting SSE connections so they send the new event.
    with _hot_reload_waiters_lock:
        for waiter in _hot_reload_waiters:
            waiter.set()

    logger.info("Hot-reload event dispatched for node %s", node_id)


def get_hot_reload_event_count() -> int:
    """Return the number of hot-reload events dispatched so far.

    Useful for health checks and testing.
    """
    with _hot_reload_lock:
        return len(_hot_reload_events)


def reset_hot_reload_events() -> None:
    """Clear all hot-reload events.

    Called when a new bundle version is deployed to the preview server,
    since old events are no longer relevant.
    """
    with _hot_reload_lock:
        _hot_reload_events.clear()

    logger.debug("Hot-reload events cleared")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
