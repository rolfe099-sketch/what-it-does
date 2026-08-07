# Tidepool — a sample application

**This is not a real product, and it is not meant to run.** It is a fictional
team-workspace SaaS, written to be scanned.

It exists because a demo of an analysis tool has to show the tool finding
something, and pointing a scanner at somebody else's real codebase to publish
its problems is not a thing to do. So the code here is invented — but it is
invented honestly:

- Every file is written the way this kind of application actually gets
  written, including the shortcuts that come with assembling one quickly.
- The problems in it are the ones that show up repeatedly in real code: a
  guard on the read but not the delete, a checkout endpoint nobody protected,
  a middleware matcher that covers the pages and quietly misses the API.
- Most of the code is **correct**, because a demo where everything is broken
  teaches nothing about what a finding means.

The report generated from it is not edited. The scanner reads these files with
no special handling, and whatever it says is what it found.

Run it yourself:

```
npx what-it-does examples/tidepool
```
