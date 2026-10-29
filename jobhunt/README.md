# jobhunt

Searches several job boards for stepping-stone and junior cloud/infra/DevOps roles, merges duplicates across boards, and ranks each job against a CV-derived profile.

Pure Python 3.11+ standard library — no dependencies.

## Boards

| Board | Key needed | Get one |
|---|---|---|
| Reed | `REED_API_KEY` | https://www.reed.co.uk/developers/jobseeker (free) |
| Adzuna (aggregates many UK boards, incl. listings syndicated from Totaljobs, CV-Library etc.) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | https://developer.adzuna.com/ (free) |
| Remotive (remote, UK/Europe/worldwide only) | none | — |

Boards without credentials are skipped. Indeed and LinkedIn have no public search API, so they're not included.

## Run

```bash
cd jobhunt
export REED_API_KEY=...  ADZUNA_APP_ID=...  ADZUNA_APP_KEY=...
python -m jobhunt                       # all boards
python -m jobhunt --cv cv.txt           # also weight skills by how often your CV mentions them
python -m jobhunt --sources reed --min-score 40
```

Output goes to `output/`:

- `report.md` — ranked table with clickable links; 🆕 marks jobs not seen on a previous run
- `jobs.csv` — every unique job with its score and reasons (sort/filter in a spreadsheet)
- `raw.json` — unscored results; re-score after tweaking the profile with `--from-json output/raw.json`
- `seen.json` — history used for the 🆕 flag

`cv.txt` / `cv.md` are git-ignored so personal details stay out of the repo.

## How ranking works

Everything is configured in `profile.toml`:

- **queries** — target titles sent to each board (junior DevOps/cloud, cloud support, infrastructure, 3rd line, Linux sysadmin, …)
- **good_titles** — +20 when the title looks like cloud/infra/DevOps work
- **seniority** — junior/graduate/associate boosted; senior/lead/principal/architect penalised
- **exclude** — titles like 1st line / helpdesk / DV clearance are dropped (score −100)
- **skills** — weighted CV skills (Terraform, AWS, Docker, GitHub Actions, Linux, …) matched in title + description
- **max_years_experience** — −15 if the ad asks for that many years or more
- **min_salary** — −10 if the advertised maximum is below it, +5 if it meets it

Run `python -m jobhunt --from-json output/raw.json` after editing the profile to see the effect without hitting the APIs again.

## Scheduled run (GitHub Actions)

`.github/workflows/jobhunt.yml` runs daily at 06:17 UTC and uploads the report as a build artifact (not committed, so the repo stays clean). Add the API keys as repository secrets: `REED_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`. The 🆕 history is carried between runs with the Actions cache.

## Tests

```bash
python -m unittest -v
```
