"""Minimal stdio MCP server exposing safe queue operations.

Mutating submission is intentionally unavailable through MCP until the caller
passes the exact candidate id and an explicit confirmation argument.
"""
from __future__ import annotations
import json, os, sys, subprocess
from .core import Queue, validate_candidate

ROOT = os.environ.get("AIC_LEADERBOARD_ROOT", ".")

def reply(i, result=None, error=None):
    msg = {"jsonrpc":"2.0", "id":i}
    msg["error"] = {"code": -32602, "message": error} if error else {"result": result}
    print(json.dumps(msg, ensure_ascii=False), flush=True)

def main():
    q = Queue(ROOT)
    for line in sys.stdin:
        try:
            req = json.loads(line); method = req.get("method"); args = req.get("params", {}) or {}; i = req.get("id")
            if method == "initialize": reply(i, {"protocolVersion":"2024-11-05", "capabilities":{"tools":{}}, "serverInfo":{"name":"aic-leaderboard","version":"0.1.0"}})
            elif method == "notifications/initialized": continue
            elif method == "tools/list": reply(i, {"tools":[
                {"name":"aic_validate_candidate","description":"Validate a local AIC result archive without uploading it.","inputSchema":{"type":"object","required":["path"],"properties":{"path":{"type":"string"}}}},
                {"name":"aic_queue_status","description":"Read local queue state.","inputSchema":{"type":"object","properties":{}}},
                {"name":"aic_enqueue_candidate","description":"Add a validated candidate to the local queue.","inputSchema":{"type":"object","required":["path","stage","team"],"properties":{"path":{"type":"string"},"stage":{"type":"string"},"team":{"type":"string"}}}},
                {"name":"aic_submit_candidate","description":"Submit exactly one queued candidate; requires explicit confirmation.","inputSchema":{"type":"object","required":["id","confirm_real_submit"],"properties":{"id":{"type":"string"},"confirm_real_submit":{"type":"boolean"}}}}
            ]})
            elif method == "tools/call":
                name = args.get("name"); a = args.get("arguments", {})
                if name == "aic_validate_candidate": result = validate_candidate(a["path"])
                elif name == "aic_queue_status": result = q.status()
                elif name == "aic_enqueue_candidate": result = q.enqueue(a["path"], stage=a["stage"], team=a["team"])
                elif name == "aic_submit_candidate":
                    if a.get("confirm_real_submit") is not True: raise ValueError("explicit confirm_real_submit=true is required")
                    candidate_id = str(a.get("id", ""))
                    if not candidate_id: raise ValueError("candidate id is required")
                    proc = subprocess.run([sys.executable, "-m", "aic_leaderboard.cli", "--root", ROOT,
                                           "submit", "--id", candidate_id, "--confirm-real-submit"],
                                          capture_output=True, text=True, env=os.environ.copy())
                    if proc.returncode: raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "submission failed")
                    result = json.loads(proc.stdout)
                else: raise ValueError("unknown tool")
                reply(i, {"content":[{"type":"text","text":json.dumps(result,ensure_ascii=False,indent=2)}]})
            else: reply(i, error="unknown method")
        except Exception as exc: reply(req.get("id") if isinstance(req,dict) else None, error=str(exc))

if __name__ == "__main__": main()
