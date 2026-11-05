# Workflow dependency maintenance

The `Action Pins` workflow checks GitHub Actions workflows, reusable workflow calls,
local composite actions, and container references. External actions and reusable
workflows must use full commit SHAs. Container images must use SHA-256 digests.
Local action paths remain valid.

## Review a dependency update

1. Check the upstream repository, release notes, and exact commit or image digest.
2. Keep a version comment beside each action SHA for review and update discovery.
3. Review Dependabot's weekly Actions and scanner updates. Do not enable automatic merges.
4. Confirm `Verify immutable workflow dependencies` passes for the proposed commit.
5. Complete the repository's existing checks and required human review before merging.

The scanner is zizmor, installed from checksum-locked wheels in
`.github/requirements-action-pins.txt`. It runs offline and fails on mutable action
or image references. Invalid workflow input also fails the check. Other zizmor
findings are outside this check's scope. Dependabot maintains the scanner's pip
entry under `/.github`; keep its wheel hashes when updating it.

Pinning prevents a tag from silently changing the downloaded dependency. It does
not establish that pinned code is trustworthy, lock dependencies downloaded by
that code, or replace token restrictions and human review.

## Release gate

Stop a merge when this check fails. Resolve the dependency reference and rerun CI.
Do not bypass the check or restore a mutable tag to recover a release.
This change does not activate repository settings or branch rules. A maintainer
must make the check mandatory where the repository plan supports required checks.
Confirm all maintained release branches are pinned before enabling GitHub's
repository-wide SHA pinning policy. Use the normal release and rollback process;
these changes do not deploy the application.
