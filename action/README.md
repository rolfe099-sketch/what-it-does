# what-it-does — pull request check

Comments on a pull request with what it changed about your application's
**behaviour**, not which lines moved.

```
DELETE /api/projects/[id]
  − No longer: Checks who is asking
  ! 1 new thing worth checking
```

## Use it

Copy [`example-workflow.yml`](./example-workflow.yml) to
`.github/workflows/what-it-does.yml`, or start from this:

```yaml
name: what it does
on: pull_request

jobs:
  behaviour:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: rolfe099-sketch/what-it-does/action@v1
        with:
          # Free on public repositories. Required for private ones.
          licence-key: ${{ secrets.WHAT_IT_DOES_KEY }}
```

| Input | Default | |
|---|---|---|
| `licence-key` | `''` | Free on public repositories; required for private ones |
| `path` | `.` | Where the application is, if not the repository root |
| `fail-on-new` | `false` | Fail the check when a finding appears that was not there before |
| `comment` | `true` | Post the result as a pull request comment |

Outputs `changed`, `new-findings` and `markdown`, so you can do something else
with the result instead.

## What it does to your repository

Nothing. Your code is read by a CLI running on your own runner, and the only
request that leaves is an optional licence check carrying a key and nothing
else. The scanner itself makes no network calls at all.

It **fails open**. If a scan errors, if the licence check is unreachable, if
anything goes sideways — the check passes and says so in the log. The only red
it ever produces is a finding you asked it to fail on with `fail-on-new`.

It is also quiet: no comment when nothing changed, and the existing comment is
edited rather than a new one added on every push.

## Pricing

Free on public repositories and always will be. Private repositories are priced
on **active committers** — anyone who has committed in the last 90 days,
counted from your own git history inside your own runner by the equivalent of
`git shortlog -sn --since=90.days`. Nothing is reported anywhere.

Team ≤10 · $49/mo — Business ≤50 · $149/mo — Scale · $399/mo

https://eriksenlabs.com/#what-it-does
