# Todo to issues

Scan new TODOs introduced on the default branch and open issues for the ones that do not already exist.

## Workflow

```yaml
name: todo-to-issue

on: push

jobs:
  todo-to-issues:
    runs-on: ubuntu-latest
    if: ${{ github.ref_name == github.event.repository.default_branch }}
    permissions:
      contents: read # scan repo for TODOs
      issues: write # create issues for new TODOs
    steps:
      - name: Checkout
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4

      - name: Run sudden-agent
        uses: sudden-network/agent@310d63c51531380a74429c518faae5348e74df59 # v1
        with:
          agent_api_key: ${{ secrets.OPENAI_API_KEY }}
          prompt: |
            Scan the repository for TODO comments introduced by this merge.
            For each new TODO, check whether a matching issue already exists.
            If there is no matching issue, create a new issue that references the file and line.
            Do not create duplicates. Do not reopen or edit existing issues.
```
