from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

from .core import Queue, validate_candidate


def main(argv=None):
    ap = argparse.ArgumentParser(description="Portable AIC submission queue")
    ap.add_argument("--root", default=os.environ.get("AIC_LEADERBOARD_ROOT", "."))
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate"); v.add_argument("candidate")
    e = sub.add_parser("enqueue"); e.add_argument("candidate"); e.add_argument("--stage", required=True); e.add_argument("--team", required=True)
    sub.add_parser("status")
    s = sub.add_parser("submit"); s.add_argument("--id", required=True); s.add_argument("--confirm-real-submit", action="store_true")
    args = ap.parse_args(argv)
    q = Queue(args.root)
    if args.cmd == "validate": out = validate_candidate(args.candidate)
    elif args.cmd == "enqueue": out = q.enqueue(args.candidate, stage=args.stage, team=args.team)
    elif args.cmd == "status": out = q.status()
    else:
        state = q.read(); item = next((x for x in state["queue"] if x["id"] == args.id), None)
        if item is None: raise SystemExit("unknown candidate id")
        if not args.confirm_real_submit:
            out = {"dry_run": True, "would_submit": item, "message": "pass --confirm-real-submit to click the browser"}
        else:
            if q.status()["active"] and q.status()["active"]["id"] != item["id"]:
                raise SystemExit("another submission is active; refusing duplicate submit")
            item["status"] = "submitting"; q.write(state)
            env = {**os.environ, "AIC_LEADERBOARD_ROOT": str(q.root),
                   "AIC_LEADERBOARD_CONFIRM": "true",
                   "AIC_LEADERBOARD_FENCE_MODE": "local",
                   "AIC_LEADERBOARD_EXPECTED_SHA256": item["sha256"],
                   "AIC_LEADERBOARD_SUBMIT_URL": os.environ.get("AIC_LEADERBOARD_SUBMIT_URL", ""),
                   "AIC_LEADERBOARD_LEADERBOARD_URL": os.environ.get("AIC_LEADERBOARD_LEADERBOARD_URL", "")}
            rc = subprocess.run(["node", str(q.root / "tools" / "leaderboard_cdp.mjs"), "submit-one", item["path"]], env=env).returncode
            item["status"] = "accepted" if rc == 0 else "outcome_unknown"
            q.write(state); out = {"returncode": rc, "item": item}
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
