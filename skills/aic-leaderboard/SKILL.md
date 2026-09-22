---
name: aic-leaderboard
description: Validate, queue, submit and attribute scores for AIC competition result archives using a local browser session.
---

Use `aic_leaderboard` for AIC leaderboard work. Read the project README and configure
`AIC_LEADERBOARD_ROOT`, `AIC_LEADERBOARD_SUBMIT_URL`, and `AIC_LEADERBOARD_LEADERBOARD_URL`.

The default workflow is read-only: validate the archive, compute its SHA-256, enqueue it,
and show the exact candidate identity. Never submit unless the user explicitly asks for a
real submission and confirms the candidate id. One active submission blocks all other
submissions. An upload acknowledgement is not a score; only a score tied to the same
candidate hash and accepted submission window may be recorded.

Do not copy browser profiles, cookies, local storage, API tokens, or passwords into the
repository. Start a dedicated Chrome profile with CDP port 9222 and let the user log in.
If CDP is unavailable, stop without changing queue state.

Commands:

```text
python -m aic_leaderboard.cli --root . validate candidate.zip
python -m aic_leaderboard.cli --root . enqueue candidate.zip --stage semi --team TEAM
python -m aic_leaderboard.cli --root . status
python -m aic_leaderboard.cli --root . submit --id QUEUE_ID --confirm-real-submit
```
