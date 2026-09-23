# GitHub App setup

This folder contains a helper HTML page with an embedded manifest to create a GitHub App with the right defaults.

## When to use a GitHub App

- You want a distinct bot identity for comments and commits.
- You need your agent to be able to update workflow files in `.github/workflows`.
- You need your agent to refresh repository Actions secrets such as `CODEX_AUTH_JSON`.
- You need org-wide access across multiple repos.

## Create the app

1. Open [create-app.html](./create-app.html) in your browser (download it first, then open locally).
2. Select the App owner and `CODEX_AUTH_JSON` scope. Use an organization-owned App for organization repositories and secrets.
3. Click "Create GitHub App from manifest".
4. Review the configuration and create the app.
5. GitHub redirects you with a `code` in the URL. Paste that code into the helper page to get the conversion command.
6. Run the conversion command to finalize the app and get the client ID and private key:

```bash
gh api --method POST /app-manifests/<code>/conversions
```

7. Install the app on your org or repo. Select the repo(s) you want the app to access. If “selected repositories,” ensure your target repo is included.

Alternatively create the app manually in GitHub settings if you want different permissions.

## Store credentials

- Set `WORKFLOW_AGENT_GITHUB_APP_CLIENT_ID` as a variable.
- Set `WORKFLOW_AGENT_GITHUB_APP_PRIVATE_KEY` as a secret.

Use org-level settings for reuse across repos, or repo-level settings for a single repo.

## Use in a workflow

```yaml
- uses: actions/create-github-app-token@v3
  id: app_token
  with:
    client-id: ${{ vars.WORKFLOW_AGENT_GITHUB_APP_CLIENT_ID }}
    private-key: ${{ secrets.WORKFLOW_AGENT_GITHUB_APP_PRIVATE_KEY }}
    permission-secrets: write
    # Add only when CODEX_AUTH_JSON is an organization secret:
    # permission-organization-secrets: write

- uses: sudden-network/agent@v1
  with:
    agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}
    github_token: ${{ steps.app_token.outputs.token }}
    github_token_actor: ${{ steps.app_token.outputs.app-slug }}[bot]
    ...
```

## Use Codex with ChatGPT in Actions

For the default agent (`codex`), `agent_auth_file` can inject Codex's `auth.json` so the CLI can use a ChatGPT subscription. Codex can update that login file during a run, so the action saves the updated file back into `CODEX_AUTH_JSON`.

During a run:

- The workflow passes `agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}`.
- The action writes that value to Codex's `~/.codex/auth.json`.
- Codex may update `auth.json`.
- If `auth.json` changed, the action saves it back to the existing `CODEX_AUTH_JSON` repository or organization secret.

Requirements:

- Use ChatGPT auth only for trusted private automation. Public and open-source repositories must use API key authentication.
- Use one dedicated login per serialized job stream in one private repository. Do not share it across repositories or concurrent jobs.
- The workflow must pass `agent_auth_file: ${{ secrets.CODEX_AUTH_JSON }}`. GitHub does not let actions read secret values by name.
- `CODEX_AUTH_JSON` must already exist as a repository secret or an organization secret shared with the repository.
- A repository secret needs a GitHub App token with `permission-secrets: write`.
- An organization secret also needs `permission-organization-secrets: write` and the App's `organization_secrets: write` permission.
- The default `GITHUB_TOKEN` cannot update either secret.

Follow OpenAI's [CI/CD authentication guidance](https://learn.chatgpt.com/docs/auth/ci-cd-auth). Start each workflow run only after the previous run saves its refreshed credential. GitHub [reads repository and organization secrets when a workflow is queued](https://docs.github.com/en/actions/reference/security/secrets). A concurrency group alone cannot prevent a queued run from restoring an old credential. Use separate private repositories and fresh logins for independent streams, or use API key authentication.

Use a separate Codex `auth.json` for this GitHub Actions secret. Running `codex logout` with the same file revokes its refresh token and invalidates `CODEX_AUTH_JSON`. Treat the file like a password, as described in the [Codex authentication documentation](https://developers.openai.com/codex/auth).

### Create and upload the secret

Use Bash on macOS, Linux, or WSL. Install Node.js and the GitHub CLI. Authenticate `gh`, then run the helper from a clone of this repository:

```bash
gh auth login
./scripts/setup-codex-auth-secret.sh
```

The helper:

1. Lets you choose a repository Actions secret or organization Actions secret.
2. Lists only private repositories where you have admin access.
3. Restricts an organization secret to one selected private repository.
4. Shows the target, existing visibility, resulting access, and create or replace action.
5. Asks whether you are on a remote machine.
6. On a remote machine, prints one macOS command for the selected target, then exits.
7. Otherwise, confirms the action and opens a fresh Codex browser login in a temporary `CODEX_HOME`.
8. Uploads a nonempty, permission-restricted auth file through `gh secret set`, then deletes the temporary files.

Use the Up and Down arrow keys and press Enter to choose. Press `q` to cancel. Menus redraw after each movement, including terminals without ANSI support.

On a remote machine, choose `Yes, show a command for my local Mac`. Copy the printed command and run it on a trusted Mac. The Mac needs Bash, curl, Node.js, and an authenticated GitHub CLI. The command opens the browser login locally and uploads the auth file directly to GitHub. It checks that the file is nonempty before upload and deletes temporary files on exit. The credential does not pass through the clipboard or remote machine.

OpenAI recommends [device-code authentication (beta)](https://developers.openai.com/codex/auth) for general headless Codex login. This helper offers a Mac handoff so the dedicated credential goes directly from the trusted local machine to GitHub.

Organization secrets always use `selected` visibility with exactly one private repository. The helper does not offer `private`, `all`, or multiple-repository access. Replacing an existing organization secret also replaces its access list; other repositories lose access. Review the target before confirming. A repository secret named `CODEX_AUTH_JSON` takes precedence over an organization secret with the same name.

Organization secret setup needs GitHub organization owner access. For a GitHub CLI OAuth login, add the required scope before running the helper:

```bash
gh auth refresh --scopes admin:org
```

Create a fresh login for each serialized job stream. Do not reuse one generated `auth.json` across separate secrets or repositories.

### Manual macOS clipboard setup

Create that separate file locally without touching your normal `~/.codex` login:

```bash
curl -fsSL https://raw.githubusercontent.com/sudden-network/agent/main/scripts/bootstrap-codex-auth.sh | bash
```

The script uses Codex browser login with a fresh temporary `CODEX_HOME` and copies `auth.json` with macOS `pbcopy`. Paste it into the private repository's `CODEX_AUTH_JSON` secret in GitHub Settings, then clear the clipboard with `pbcopy </dev/null`. For command-line uploads, use the setup helper's validated file flow above.
