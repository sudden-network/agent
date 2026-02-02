Here’s a concrete strategy that keeps context tight, avoids re‑feeding full history, and handles PRs + PR comments + commits safely.

1) Normalize a “subject” key (issue vs PR)
- Use a single key per thread:
  action-agent-session-{type}-{number} where type ∈ {issue, pr}.
- For issue_comment events, check payload.issue.pull_request — if present, treat as pr.

2) Centralize event detection
Use github.context.eventName + payload to map to:
- subjectType (issue or pr)
- subjectNumber
- eventKind (created/edited/sync/review_comment/etc.)
- eventTimestamp (from payload)

Events to wire for PR support:
- pull_request with opened, reopened, edited, synchronize, ready_for_review
- issue_comment for PR conversation comments
- pull_request_review_comment for inline code comments
- (optional) pull_request_review for review state changes

3) Stale‑run guard
For PRs, stale commits are common. Use a hard check:
- Fetch latest PR head.sha.
- If the event’s after/pull_request.head.sha ≠ latest, exit early.
- If you want to avoid extra API calls, also set concurrency to cancel in progress:
  - group: pr-${{ github.event.pull_request.number }}
  - cancel-in-progress: true

This alone will prevent all but the last commit from finishing, and the SHA check covers race conditions.

4) Delta‑only context
Store minimal state in the session artifact, e.g. a state.json:
{
  "subjectType": "pr",
  "subjectNumber": 41,
  "lastHeadSha": "abc123",
  "lastIssueCommentId": 12345,
  "lastReviewCommentId": 45678,
  "lastEventAt": "2026-02-02T16:00:00Z"
}

On each run:
- Commits: compare lastHeadSha → current head.sha.
  If different, fetch compare diff (compare API) and summarize changes.
- Issue comments (PR conversation): list comments since lastIssueCommentId.
- Review comments (inline): list review comments since lastReviewCommentId.

Feed only the delta into the prompt:
- “New commits since last run: …”
- “New PR comment: …”
- “New inline review comment: path/line + body: …”

Then update state.json and persist in the artifact.

5) Event coverage for PRs
- pull_request (opened/edited/synchronize) gives title/body changes + commits.
- issue_comment (PR conversation) gives general thread discussion.
- pull_request_review_comment gives inline code notes.

This captures the major context without replaying everything.

Why this works
- Keeps one session per PR/issue.
- Skips stale work safely.
- Supplies only new info since the last run.
- Supports PR title/body edits, new commits, comments, and inline comments without duplication.

If you want, I can implement:
- subject detection
- artifact naming action-agent-session-{issue|pr}-{number}
- state.json for delta tracking
- commit/comment delta fetch
- stale SHA check + concurrency strategy
