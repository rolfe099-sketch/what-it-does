# The 292-repository study

The code behind [*We scanned 292 Next.js apps*](https://eriksenlabs.com/research/unguarded-endpoints/).
Published so the result can be re-run and disagreed with.

## What it does

```
node sample.mjs 100        # 400 repos, 100 from each of four star bands
node run.mjs <cli> ./work  # clone shallow, scan, record, delete
node report.mjs            # the aggregate, with Wilson intervals
```

`sample.mjs` builds the frame from GitHub's repository search. It samples in
star bands rather than sorting by stars, because a top-stars sort fills the
sample with mature, heavily reviewed projects and understates the answer.

`run.mjs` clones each repository shallow, scans it with the **published** build
of `what-it-does` — not a working tree — deletes the clone, and writes one row
per repository. A workspace root is followed one level down into its
applications, and the results summed back into a single row, so the repository
stays the unit of analysis.

`report.mjs` aggregates. `verify.mjs` pulls a deterministic random sample of
findings back out of the repositories so they can be read by hand.
`directive.mjs` checks whether flagged files carry `'use server'`.
`effect.mjs` replays a suppression rule over an existing result set to measure
what a change to the scanner would have done.

## What is not here

**`results.json` is not published, and will not be.** It pairs repository names
with findings, and a list of "these projects have unguarded destructive
endpoints" is a target sheet for a claim the study explicitly does not make.
Findings are things to check, not proven vulnerabilities. The aggregate is the
result; the names were only ever kept locally so a finding could be re-read and
verified.

Re-running `sample.mjs` builds a fresh frame, so anyone can reproduce the method
without inheriting our list.

## Things that went wrong, so you can avoid them

The first pilot reported 17 "scan errors" out of 44. Every one was the scanner
exiting 1 with a correct explanation — the CLI prints its `Scanning …` banner to
stderr on every run, so classifying on stderr text put everything in one bucket.
Use the exit code and read past the banner.

Thirteen of the first forty-eight repositories were monorepos, recorded as
unreadable. That is 27% of a sample, and the excluded projects were the
substantial ones — any figure produced before that was biased toward toy apps.

`gapKinds` and `sources` are parallel arrays over the same findings. Filtering
rows by `unprotected` and then taking every source mixes finding types together,
and a false-positive rate measured on the wrong population is worse than none.

Repositories scanned through workspace traversal report paths relative to the
application directory, not the repository root, so a verification pass has to
find files by path suffix rather than joining from the root.

## Method notes

The denominator matters. An application with no consequential behaviour cannot
fail the test, so the rate is reported over the applications that *can* — those
that delete data, take payment, or change access. Reporting over all scanned
repositories instead gives a flattering number that means nothing.

Confidence intervals are Wilson score intervals, which stay honest at these
sample sizes where the normal approximation does not.

No claim is made about who or what wrote any of this code. Nothing in a
repository tells you that.
