# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The specification is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are stored one per file at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
- Issue numbers start at `01`; do not combine all issues into one ticket file.
- State is recorded using a `Status:` line near the top of each issue file.
- Comments and conversation history are appended under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create the corresponding file under `.scratch/<feature-slug>/`, creating directories when needed.

## When a skill says "fetch the relevant ticket"

Read the referenced issue file directly. The user will normally provide its path or issue number.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child issue: `.scratch/<effort>/issues/NN-<slug>.md`
- `Type:` records `research`, `prototype`, `grilling`, or `task`.
- `Status:` records `claimed` or `resolved`.
- `Blocked by:` lists blocking issue numbers. An issue is unblocked when all listed issues are resolved.
- Claim an issue by setting `Status: claimed` before starting work.
- Resolve an issue by adding an `## Answer`, setting `Status: resolved`, and recording the result in the map.

