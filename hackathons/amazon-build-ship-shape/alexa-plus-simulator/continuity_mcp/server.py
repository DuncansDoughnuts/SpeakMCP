from __future__ import annotations

import hashlib
import json
import secrets
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

PROTOCOL_VERSION = "2025-11-25"
MAX_BODY = 64 * 1024
ALLOWED_ORIGINS = {"http://127.0.0.1", "http://localhost", "null"}

@dataclass
class Workflow:
    id: str
    state: str = "created"
    checkpoint: int = 0
    approval_token: str | None = None
    completed_effects: set[str] = field(default_factory=set)
    ledger: list[dict[str, Any]] = field(default_factory=list)

@dataclass
class Session:
    id: str
    workflow: Workflow
    terminated: bool = False
    lock: threading.RLock = field(default_factory=threading.RLock)

class Store:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.lock = threading.RLock()

    def new_session(self) -> Session:
        sid = secrets.token_urlsafe(32)
        sess = Session(sid, Workflow(id=secrets.token_hex(8)))
        with self.lock:
            self.sessions[sid] = sess
        return sess

    def get(self, sid: str) -> Session | None:
        with self.lock:
            return self.sessions.get(sid)

STORE = Store()

def _event(wf: Workflow, action: str, outcome: str, **extra: Any) -> None:
    wf.ledger.append({"ts": time.time(), "action": action, "outcome": outcome, **extra})

def _digest(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]

def _tool_call(sess: Session, name: str, args: dict[str, Any]) -> dict[str, Any]:
    wf = sess.workflow
    with sess.lock:
        if name == "continuity.status":
            return {"workflow_id": wf.id, "state": wf.state, "checkpoint": wf.checkpoint, "ledger_size": len(wf.ledger)}
        if name == "continuity.start":
            if wf.state == "created":
                wf.state = "running"
                wf.checkpoint = 1
                _event(wf, name, "started")
            return {"state": wf.state, "checkpoint": wf.checkpoint}
        if name == "continuity.checkpoint":
            if wf.state not in {"running", "waiting_approval"}:
                return {"ok": False, "error": "invalid_state"}
            wf.checkpoint += 1
            _event(wf, name, "checkpointed", checkpoint=wf.checkpoint)
            return {"ok": True, "checkpoint": wf.checkpoint}
        if name == "continuity.approve":
            wf.approval_token = secrets.token_hex(12)
            wf.state = "waiting_approval"
            _event(wf, name, "approved")
            return {"approved": True, "approval_token": wf.approval_token}
        if name == "continuity.execute_irreversible":
            effect_id = str(args.get("effect_id") or "default")
            idem = str(args.get("idempotency_key") or "")
            if not idem:
                return {"ok": False, "error": "idempotency_key_required"}
            effect_key = f"{effect_id}:{idem}"
            if effect_key in wf.completed_effects:
                _event(wf, name, "replayed", effect=effect_key)
                return {"ok": True, "executed": False, "replayed": True, "effect": effect_key}
            if not wf.approval_token:
                _event(wf, name, "blocked_no_approval", effect=effect_key)
                return {"ok": False, "error": "approval_required"}
            wf.completed_effects.add(effect_key)
            wf.approval_token = None
            wf.state = "completed"
            wf.checkpoint += 1
            _event(wf, name, "executed", effect=effect_key)
            return {"ok": True, "executed": True, "replayed": False, "effect": effect_key}
        if name == "continuity.resume":
            if wf.state == "completed":
                return {"ok": True, "state": "completed", "checkpoint": wf.checkpoint}
            wf.state = "running"
            _event(wf, name, "resumed", checkpoint=wf.checkpoint)
            return {"ok": True, "state": wf.state, "checkpoint": wf.checkpoint}
        if name == "continuity.ledger":
            return {"events": list(wf.ledger), "digest": _digest(wf.ledger)}
        raise KeyError(name)

TOOLS = [
    "continuity.status", "continuity.start", "continuity.checkpoint",
    "continuity.approve", "continuity.execute_irreversible", "continuity.resume",
    "continuity.ledger",
]

class MCPHandler(BaseHTTPRequestHandler):
    server_version = "ContinuityMCP/0.5"

    def log_message(self, fmt, *args):
        return

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        return origin is None or origin in ALLOWED_ORIGINS

    def _session(self, require: bool = True) -> Session | None:
        sid = self.headers.get("MCP-Session-Id")
        if not sid:
            if require:
                self._json(400, {"error": "missing_session"})
            return None
        sess = STORE.get(sid)
        if not sess or sess.terminated:
            self._json(404, {"error": "unknown_session"})
            return None
        if self.headers.get("MCP-Protocol-Version") != PROTOCOL_VERSION:
            self._json(400, {"error": "unsupported_protocol_version"})
            return None
        return sess

    def _json(self, code: int, obj: Any, headers: dict[str, str] | None = None):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if headers:
            for k, v in headers.items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)

    def _empty(self, code: int):
        self.send_response(code); self.send_header("Content-Length", "0"); self.end_headers()

    def _read_json(self):
        length = self.headers.get("Content-Length")
        if length is None:
            return None, "length_required"
        try: n = int(length)
        except ValueError: return None, "invalid_length"
        if n < 0 or n > MAX_BODY: return None, "body_too_large"
        raw = self.rfile.read(n)
        try: return json.loads(raw), None
        except Exception: return None, "malformed_json"

    def do_GET(self):
        if self.path != "/mcp": return self._json(404, {"error": "not_found"})
        if not self._origin_ok(): return self._json(403, {"error": "origin_rejected"})
        return self._json(405, {"error": "sse_listener_not_enabled"})

    def do_DELETE(self):
        if self.path != "/mcp": return self._json(404, {"error": "not_found"})
        if not self._origin_ok(): return self._json(403, {"error": "origin_rejected"})
        sess = self._session(True)
        if not sess: return
        with sess.lock: sess.terminated = True
        return self._empty(204)

    def do_POST(self):
        if self.path != "/mcp": return self._json(404, {"error": "not_found"})
        if not self._origin_ok(): return self._json(403, {"error": "origin_rejected"})
        accept = self.headers.get("Accept", "")
        if "application/json" not in accept or "text/event-stream" not in accept:
            return self._json(406, {"error": "accept_must_include_json_and_sse"})
        msg, err = self._read_json()
        if err: return self._json(400 if err != "body_too_large" else 413, {"error": err})
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            return self._json(400, {"error": "invalid_jsonrpc"})
        method = msg.get("method")
        if method == "initialize":
            sess = STORE.new_session()
            result = {"jsonrpc":"2.0","id":msg.get("id"),"result":{"protocolVersion":PROTOCOL_VERSION,"capabilities":{},"serverInfo":{"name":"continuity-mcp","version":"0.5"}}}
            return self._json(200, result, {"MCP-Session-Id": sess.id})
        sess = self._session(True)
        if not sess: return
        if method == "notifications/initialized": return self._empty(202)
        if method == "tools/list":
            return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"result":{"tools":[{"name":t} for t in TOOLS]}})
        if method == "tools/call":
            p = msg.get("params") or {}; name = p.get("name"); raw_args = p.get("arguments", {})
            if name not in TOOLS: return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"error":{"code":-32602,"message":"unknown_tool"}})
            if not isinstance(raw_args, dict): return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"error":{"code":-32602,"message":"invalid_arguments"}})
            args = raw_args
            try: out = _tool_call(sess, name, args)
            except Exception as e:
                return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"error":{"code":-32603,"message":type(e).__name__}})
            return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"result":{"content":[{"type":"text","text":json.dumps(out,sort_keys=True)}],"structuredContent":out}})
        return self._json(200, {"jsonrpc":"2.0","id":msg.get("id"),"error":{"code":-32601,"message":"method_not_found"}})

def run(host="127.0.0.1", port=8765):
    httpd = ThreadingHTTPServer((host, port), MCPHandler)
    httpd.serve_forever()

if __name__ == "__main__": run()
