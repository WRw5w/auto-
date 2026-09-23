# AIC Leaderboard Control

Portable submission control for AIC competition tracks. It is designed for the
`auto-` repository and can be used from any checkout on Windows, macOS or Linux
as long as Python, Node.js and a Chromium browser are available.

The project separates four concerns: candidate validation, durable queue state,
browser submission, and score attribution. Login state stays in a user-owned
Chrome profile. No cookie, token or password is stored by this project.

The default browser transport uses Playwright and Chrome's debugging pipe.
Install its Node dependency with `npm install`. It does not require port 9222.
Playwright uses the installed Chrome channel on each OS; set
`AIC_LEADERBOARD_CHROME_PATH` only if Chrome is in a custom location.
The browser profile defaults to a separate directory under the system temp
directory; set `AIC_LEADERBOARD_PIPE_PROFILE` to keep it in a chosen location.
Only one process can use that profile at a time.

## Safe setup

```powershell
python -m pip install -e .
$env:AIC_LEADERBOARD_ROOT = (Get-Location).Path
$env:AIC_LEADERBOARD_SUBMIT_URL = 'https://your-aic-submit-page'
$env:AIC_LEADERBOARD_LEADERBOARD_URL = 'https://your-aic-leaderboard-page'
npm install
node tools/leaderboard_pipe.mjs probe
node tools/pipe_smoke.mjs
python -m aic_leaderboard.cli validate .\candidate.zip
python -m aic_leaderboard.cli enqueue .\candidate.zip --stage semi --team YOUR_TEAM
python -m aic_leaderboard.cli status
python -m aic_leaderboard.auto capture --team YOUR_TEAM
node tools/leaderboard_pipe.mjs result-records
```

The `auto` CLI requires `--dry-run` for a rehearsal and
`--confirm-real-submit` for a real click. The MCP exposes the same operations;
its submit tool requires `confirm_real_submit=true` and uses the local browser
pipe. Install the Python package and Node dependencies on each computer before
enabling the plugin's MCP server. Set the root and actual AIC page URLs in the
MCP process environment; logging in happens in the dedicated visible Chrome.

`tools/leaderboard_cdp.mjs` is adapted from the state-machine design in
`WRw5w/aic_new`: CDP preflight, one candidate per process, exact file binding,
login detection, upload readiness checks, and explicit unknown-outcome handling.

For the standard browser backend, `result-records` reads the signed-in account's
`打榜状态查询` page. This includes zero-score and infeasible submissions that do not
appear on the public leaderboard. The route defaults to the AIC account results
page and can be overridden with `AIC_LEADERBOARD_RECORDS_URL` for another AIC
track. The auto CLI attributes a `DONE` score only when the result's timestamp is
after the submit click and downloading its saved attachment yields the queued
ZIP's SHA-256. If the download or hash check is unavailable, it reports the
visible result but leaves score attribution pending for manual verification.
The legacy CDP backend still captures public leaderboard snapshots under
`leaderboard_evidence/`.
