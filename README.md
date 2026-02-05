# action-agent

Run the [OpenAI Codex CLI](https://github.com/openai/codex) as a GitHub Action for any [workflow trigger](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows) (issues, pull requests, comments, schedule, workflow_dispatch, etc.).

## Persistent sessions

Sessions persist per issue and pull request, so the agent picks up where it left off across new comments, edits, and new commits.

On pull requests, this makes long review threads practical: the agent can track what it already reviewed, follow up on changes, and stay consistent across a long back-and-forth.

Example: open a PR, get feedback, push fixes, and the next run picks up the same thread with context.

Notes:
- Session persistence requires the `actions: read` permission to download artifacts.
- Artifact retention is controlled by your repo/org settings (see [Workflow Artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)).
- Scheduled and manual dispatch runs start fresh.

## GitHub MCP (how the agent talks to GitHub)

This action starts a local MCP server that exposes GitHub tools to the agent.

- MCP inherits the same workflow `permissions` you grant to `github_token`.
- The `github_token` is held by the action process (not exposed directly to the agent).
- Use `github.octokit_request` to call GitHub REST endpoints.

## What you can build with this

Because you can attach `action-agent` to any workflow trigger and provide a tailored `prompt`, you can build focused agents. For example:

- [Code review](recipes/code-review.md) - Review PRs, respond to comments, and open follow-up issues.
- [Issue assistant](recipes/issue-assistant.md) - Auto-triage issue threads with clarifying questions and duplicate detection.
- [Manual dispatch](recipes/manual-dispatch.md) - Kick off a one-off run with a custom prompt.
- [Security audit](recipes/security-audit.md) - Run periodic code security reviews and file issues.
- [Todo to issues](recipes/todo-to-issue.md) - Create issues for new TODOs introduced on develop.

Have a useful recipe? [Open a pull request](https://github.com/sudden-network/action-agent/compare) and share it.

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| `api_key` | yes | Model provider API key (used for `codex login`). |
| `github_token` | yes | GitHub token used by the action (MCP server + artifacts). |
| `model` | no | Codex model override (passed to `codex exec --model`). |
| `reasoning_effort` | no | Codex reasoning effort override (passed via `-c model_reasoning_effort=...`). |
| `prompt` | no | Additional instructions for the agent. |
| `resume` | no | Enable per-issue/per-PR session resume (`true`/`false`). Default: `false`. |

## Configuring the agent

- Use `prompt` for per-workflow instructions (triage rules, review style, escalation policy, etc).
- If you want repo-level instructions, add an `AGENTS.md` at the repo root and run this action after `actions/checkout` so Codex can read it.

## Permissions

This action relies on the workflow `GITHUB_TOKEN`. Grant only what you need at the job level.
See GitHub documentation for [permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token).

Common permissions:
- `issues: write` to post issue comments (including PR conversation comments).
- `pull-requests: write` to comment on PRs and open PRs.
- `contents: write` to push branches/commits.
- `actions: read` to download/list artifacts.

If you want the agent to open PRs, also enable the repo setting:
Settings -> Actions -> Workflow permissions -> "Allow GitHub Actions to create and approve pull requests."

## Security

- The action only runs on private repositories and fails on public/unknown visibility.
- The action refuses to run unless the triggering `github.actor` has write access (admin/write/maintain) to the repo.
- GitHub side effects are constrained by the workflow `permissions` you grant to `GITHUB_TOKEN`.
- By default, `GITHUB_TOKEN` is scoped to the repository running the workflow: it cannot write to other repositories unless you supply a broader token with cross-repo access.
- Codex runs in `read-only` sandbox mode: it can read files but cannot write to disk or access the network, even from shell commands.
