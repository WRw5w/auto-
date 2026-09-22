# AIC Leaderboard Control

Portable submission control for AIC competition tracks. It is designed for the
`auto-` repository and can be used from any checkout on Windows, macOS or Linux
as long as Python, Node.js and a Chromium browser are available.

The project separates four concerns: candidate validation, durable queue state,
browser submission, and score attribution. Login state stays in a user-owned
Chrome profile. No cookie, token or password is stored by this project.

## Safe setup

```powershell
$env:AIC_LEADERBOARD_ROOT = (Get-Location).Path
$env:AIC_LEADERBOARD_SUBMIT_URL = 'https://your-aic-submit-page'
$env:AIC_LEADERBOARD_LEADERBOARD_URL = 'https://your-aic-leaderboard-page'
python -m aic_leaderboard.cli validate .\candidate.zip
python -m aic_leaderboard.cli enqueue .\candidate.zip --stage semi --team YOUR_TEAM
python -m aic_leaderboard.cli status
```

The CLI is dry-run unless `submit ... --confirm-real-submit` is supplied. The
MCP exposes the same operations; its submit tool also requires the explicit
boolean `confirm_real_submit=true` and uses the local CDP session.

`tools/leaderboard_cdp.mjs` is adapted from the state-machine design in
`WRw5w/aic_new`: CDP preflight, one candidate per process, exact file binding,
login detection, upload readiness checks, and explicit unknown-outcome handling.
