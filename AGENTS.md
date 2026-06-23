# Agent Instructions

## Agent skills

### Issue tracker

GitHub Issues on `Lemuria123/CursedMineSweeperByGemini3`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) with no overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Backend restart

NEVER auto-restart the backend server. Only restart the backend when the user explicitly commands it.
