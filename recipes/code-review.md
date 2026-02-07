# Code review

Review pull requests, respond to comments, and open follow-up issues when requested.

## Workflow

```yaml
name: code-review

on:
  pull_request:
    types: [opened, reopened, edited, synchronize, ready_for_review]
  pull_request_review_comment:
    types: [created, edited] # inline comments
  issue_comment:
    types: [created, edited] # PR conversation comments also come through here

jobs:
  code-review:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    permissions:
      contents: read # read PR diff and files
      pull-requests: write # inline review comments and replies
      issues: write # PR conversation comments and follow-up issues
      actions: read # resume sessions via artifacts
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run sudden-agent
        uses: sudden-network/agent@v1
        with:
          agent_api_key: ${{ secrets.OPENAI_API_KEY }}
          resume: true
          prompt: |
            Review this pull request. Be concise and specific.
            Focus on correctness, security, and maintainability.
            If you find issues, leave inline comments when appropriate and propose concrete fixes.
            Only open follow-up issues when explicitly requested.
            If there is nothing to add, react with a thumbs up on the PR itself.
```
