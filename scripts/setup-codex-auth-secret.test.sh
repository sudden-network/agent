#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/setup-codex-auth-secret.sh"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/bootstrap-codex-auth.sh"
TEST_ROOT="$(mktemp -d)"
TEST_NUMBER=0
RUN_ROOT=""
MOCK_BIN=""
GH_LOG=""
NPX_LOG=""
SECRET_INPUT=""
TEMP_DIR=""
CLIPBOARD_LOG=""
CLIPBOARD_OUTPUT=""
OUTPUT=""
RUN_PATH=""
ARROW_DOWN='\033[B'
ARROW_UP='\033[A'

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  if [[ -n "$OUTPUT" && -f "$OUTPUT" ]]; then
    echo "Script output:" >&2
    sed 's/^/  /' "$OUTPUT" >&2
  fi
  exit 1
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail "Expected $file to contain: $expected"
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "Expected $file not to contain: $unexpected"
  fi
}

assert_line() {
  local file="$1"
  local expected="$2"
  grep -Fxq -- "$expected" "$file" || fail "Expected $file to contain this line: $expected"
}

setup_run() {
  TEST_NUMBER=$((TEST_NUMBER + 1))
  RUN_ROOT="$TEST_ROOT/$TEST_NUMBER"
  MOCK_BIN="$RUN_ROOT/bin"
  GH_LOG="$RUN_ROOT/gh.log"
  NPX_LOG="$RUN_ROOT/npx.log"
  SECRET_INPUT="$RUN_ROOT/secret-input"
  TEMP_DIR="$RUN_ROOT/tmp"
  CLIPBOARD_LOG="$RUN_ROOT/clipboard.log"
  CLIPBOARD_OUTPUT="$RUN_ROOT/clipboard-output"
  OUTPUT="$RUN_ROOT/output"
  RUN_PATH="$MOCK_BIN:$PATH"
  mkdir -p "$MOCK_BIN" "$TEMP_DIR"
  : > "$GH_LOG"
  : > "$NPX_LOG"
  : > "$CLIPBOARD_LOG"

  cat > "$MOCK_BIN/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

{
  printf 'gh'
  for argument in "$@"; do
    printf '\t%s' "$argument"
  done
  printf '\n'
} >> "$TEST_GH_LOG"

if [[ "$1" == "api" && "$2" == "user" ]]; then
  [[ "${TEST_GH_AUTH_FAIL:-}" != "true" ]] || exit 1
  echo "alice"
  exit 0
fi

if [[ "$1" == "api" && "$2" == "--paginate" && "$3" == "user/memberships/orgs" ]]; then
  if [[ "${TEST_EMPTY_ORGS:-}" != "true" ]]; then
    echo "acme"
  fi
  exit 0
fi

if [[ "$1" == "org" && "$2" == "list" ]]; then
  echo "acme"
  exit 0
fi

if [[ "$1" == "repo" && "$2" == "list" ]]; then
  if [[ " $* " != *" --visibility private "* ]]; then
    echo "$3/public-repo"
    exit 0
  fi
  if [[ "${TEST_EMPTY_REPOS:-}" == "true" ]]; then
    exit 0
  fi
  case "$3" in
    alice) printf 'alice/alpha\nalice/zeta\n' ;;
    acme) printf 'acme/api\nacme/app\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [[ "$1" == "secret" && "$2" == "list" ]]; then
  for argument in "$@"; do
    if [[ "$argument" == "--repo" ]]; then
      if [[ "${TEST_REPO_SECRET_EXISTS:-}" == "true" ]]; then
        echo "CODEX_AUTH_JSON"
      fi
      exit 0
    fi
    if [[ "$argument" == "--org" ]]; then
      if [[ -n "${TEST_ORG_VISIBILITY:-}" ]]; then
        echo "$TEST_ORG_VISIBILITY"
      fi
      exit 0
    fi
  done
fi

if [[ "$1" == "secret" && "$2" == "set" ]]; then
  cat > "$TEST_SECRET_INPUT"
  [[ "${TEST_GH_SET_FAIL:-}" != "true" ]] || exit 1
  exit 0
fi

echo "Unexpected gh command" >&2
exit 1
EOF

  cat > "$MOCK_BIN/npx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_NPX_LOG"
grep -Fq 'cli_auth_credentials_store = "file"' "$CODEX_HOME/config.toml"
grep -Fq 'forced_login_method = "chatgpt"' "$CODEX_HOME/config.toml"
[[ "${TEST_LOGIN_FAIL:-}" != "true" ]] || exit 1
if [[ "${TEST_EMPTY_AUTH:-}" == "true" ]]; then
  : > "$CODEX_HOME/auth.json"
else
  printf '%s' '{"test":"TEST_ONLY_AUTH"}' > "$CODEX_HOME/auth.json"
fi
EOF

  cat > "$MOCK_BIN/pbcopy" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pbcopy called" >> "$TEST_CLIPBOARD_LOG"
if [[ "${TEST_ALLOW_CLIPBOARD:-}" == "true" ]]; then
  cat > "$TEST_CLIPBOARD_OUTPUT"
  exit 0
fi
exit 1
EOF

  cat > "$MOCK_BIN/pbpaste" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pbpaste called" >> "$TEST_CLIPBOARD_LOG"
if [[ "${TEST_ALLOW_CLIPBOARD:-}" == "true" ]]; then
  cat "$TEST_CLIPBOARD_OUTPUT"
  exit 0
fi
exit 1
EOF

  cat > "$MOCK_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-fsSL" && "$3" == "-o" ]] || exit 1
# Copy the real bootstrap, including its output-file validation.
cp "$TEST_BOOTSTRAP_SCRIPT" "$4"
[[ "${TEST_CURL_FAIL:-}" != "true" ]] || exit 22
if [[ "${TEST_BOOTSTRAP_EMPTY_OUTPUT:-}" == "true" ]]; then
  printf '%s\n' ': > "$2"' > "$4"
fi
EOF

  chmod +x "$MOCK_BIN/gh" "$MOCK_BIN/npx" "$MOCK_BIN/pbcopy" "$MOCK_BIN/pbpaste" \
    "$MOCK_BIN/curl"

  export TEST_GH_LOG="$GH_LOG"
  export TEST_NPX_LOG="$NPX_LOG"
  export TEST_SECRET_INPUT="$SECRET_INPUT"
  export TEST_CLIPBOARD_LOG="$CLIPBOARD_LOG"
  export TEST_CLIPBOARD_OUTPUT="$CLIPBOARD_OUTPUT"
  export TEST_ALLOW_CLIPBOARD=""
  export TEST_GH_AUTH_FAIL=""
  export TEST_GH_SET_FAIL=""
  export TEST_CURL_FAIL=""
  export TEST_LOGIN_FAIL=""
  export TEST_EMPTY_AUTH=""
  export TEST_BOOTSTRAP_EMPTY_OUTPUT=""
  export TEST_BOOTSTRAP_SCRIPT="$BOOTSTRAP_SCRIPT"
  export TEST_EMPTY_ORGS=""
  export TEST_EMPTY_REPOS=""
  export TEST_REPO_SECRET_EXISTS=""
  export TEST_ORG_VISIBILITY=""
}

run_success() {
  local input="$1"

  if ! printf '%b' "$input" | TMPDIR="$TEMP_DIR" PATH="$RUN_PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script exited with an error."
  fi
}

run_failure() {
  local input="$1"

  if printf '%b' "$input" | TMPDIR="$TEMP_DIR" PATH="$RUN_PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script succeeded unexpectedly."
  fi
}

assert_secret_was_uploaded() {
  [[ -f "$SECRET_INPUT" ]] || fail "The GitHub secret input was not written."
  [[ "$(< "$SECRET_INPUT")" == '{"test":"TEST_ONLY_AUTH"}' ]] || fail "The GitHub secret input changed."
  assert_not_contains "$OUTPUT" "TEST_ONLY_AUTH"
  assert_not_contains "$GH_LOG" "TEST_ONLY_AUTH"
  assert_contains "$NPX_LOG" "--yes @openai/codex@0.145.0 login"
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The automatic flow used the clipboard."
  assert_not_contains "$OUTPUT" "pbpaste | gh secret set"
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "A temporary auth file was not deleted."
  fi
}

assert_remote_handoff() {
  local expected_arguments="$1"

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran on the remote machine."
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The remote machine clipboard was used."
  [[ ! -e "$SECRET_INPUT" ]] || fail "The remote machine uploaded a GitHub secret."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_not_contains "$OUTPUT" "Open the Codex login and continue?"
  assert_not_contains "$OUTPUT" "Set CODEX_AUTH_JSON for"
  assert_contains "$OUTPUT" "On a remote machine?"
  assert_contains "$OUTPUT" 'bash -euo pipefail -c '
  assert_contains "$OUTPUT" "' _ $expected_arguments"
  assert_not_contains "$OUTPUT" "pbpaste"
  assert_not_contains "$OUTPUT" "pbcopy"
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The remote flow created a temporary auth file."
  fi
}

replay_remote_command() {
  local expected_set_command="$1"
  local command

  command="$(grep -F 'bash -euo pipefail -c ' "$OUTPUT")"
  : > "$GH_LOG"
  : > "$CLIPBOARD_LOG"
  if ! TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" bash -c "$command" > "$RUN_ROOT/replay-output" 2>&1; then
    fail "The generated local command failed."
  fi
  assert_contains "$GH_LOG" "$expected_set_command"
  [[ "$(< "$SECRET_INPUT")" == '{"test":"TEST_ONLY_AUTH"}' ]] || \
    fail "The generated local command changed the secret input."
  assert_not_contains "$RUN_ROOT/replay-output" "TEST_ONLY_AUTH"
  assert_secret_was_uploaded
}

test_personal_repository_secret() {
  setup_run
  export TEST_REPO_SECRET_EXISTS="true"
  run_success '\n\n\n\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--repo\talice/alpha'
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value."
  assert_contains "$OUTPUT" "Use Up/Down arrows to move, Enter to choose, or q to cancel."
  assert_not_contains "$OUTPUT" $'\033['
  assert_secret_was_uploaded
}

test_organization_repository_secret() {
  setup_run
  run_success "\n${ARROW_DOWN}\n${ARROW_DOWN}\n\ny\n"

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--repo\tacme/app'
  assert_not_contains "$OUTPUT" "public-repo"
  assert_contains "$OUTPUT" "This creates CODEX_AUTH_JSON."
  assert_secret_was_uploaded
}

test_new_organization_secret() {
  setup_run
  # Space must not enable sharing this credential with a second repository.
  run_success "${ARROW_DOWN}\n\n ${ARROW_DOWN} \n\ny\n"

  assert_contains "$GH_LOG" $'gh\tsecret\tlist\t--app\tactions\t--repo\tacme/app'
  assert_line "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapp'
  assert_contains "$OUTPUT" "selected private repository: acme/app"
  assert_not_contains "$OUTPUT" "All repositories"
  assert_not_contains "$OUTPUT" "Private repositories"
  assert_not_contains "$OUTPUT" "public-repo"
  assert_not_contains "$OUTPUT" "Space to select multiple"
  assert_contains "$OUTPUT" "one serialized job stream"
  assert_secret_was_uploaded
}

test_existing_selected_organization_secret() {
  setup_run
  export TEST_ORG_VISIBILITY="selected"
  run_success "${ARROW_DOWN}\n\n${ARROW_DOWN}\n\ny\n"

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapp'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: selected."
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value and organization access configuration."
  assert_secret_was_uploaded
}

test_non_ansi_menu_tracks_arrows() {
  setup_run
  run_success "\n${ARROW_UP}\n${ARROW_DOWN}${ARROW_UP}q"

  assert_line "$OUTPUT" "> acme"
  assert_line "$OUTPUT" "> acme/app"
  assert_line "$OUTPUT" "> acme/api"
  assert_line "$OUTPUT" "  2/2"
  assert_not_contains "$OUTPUT" $'\033['
  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after cancellation."
}

test_existing_private_organization_secret_is_restricted() {
  setup_run
  export TEST_ORG_VISIBILITY="private"
  run_success "${ARROW_DOWN}\n\n\n\ny\n"

  assert_line "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapi'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: private."
  assert_contains "$OUTPUT" "organization acme (selected private repository: acme/api)"
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value and organization access configuration."
  assert_secret_was_uploaded
}

test_existing_all_organization_secret_is_restricted() {
  setup_run
  export TEST_ORG_VISIBILITY="all"
  run_success "${ARROW_DOWN}\n\n\n\ny\n"

  assert_line "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapi'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: all."
  assert_contains "$OUTPUT" "organization acme (selected private repository: acme/api)"
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value and organization access configuration."
  assert_secret_was_uploaded
}

test_cancel_at_organization_selection() {
  setup_run
  run_success "${ARROW_DOWN}\nq"

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after organization cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_cancel_at_selected_repository_selection() {
  setup_run
  run_success "${ARROW_DOWN}\n\nq"

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after repository selection cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_empty_selected_organization_repository_list() {
  setup_run
  export TEST_EMPTY_REPOS="true"
  run_failure "${ARROW_DOWN}\n\n\n"

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran without an eligible organization repository."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "No private repositories with admin access found for acme."
}

test_cancel_before_login() {
  setup_run
  run_success 'q'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_cancel_at_confirmation() {
  setup_run
  run_success '\n\n\n\nn\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_rejects_shadowed_organization_secret() {
  setup_run
  export TEST_REPO_SECRET_EXISTS="true"
  run_failure "${ARROW_DOWN}\n\n\n\n"

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran for a shadowed organization secret."
  assert_contains "$OUTPUT" "Remove that repository secret before using the organization secret there."
}

test_empty_repository_list() {
  setup_run
  export TEST_EMPTY_REPOS="true"
  run_failure '\n\n'

  assert_contains "$OUTPUT" "No private repositories with admin access found for alice."
  assert_not_contains "$OUTPUT" "unbound variable"
}

test_empty_organization_list() {
  setup_run
  export TEST_EMPTY_ORGS="true"
  run_failure "${ARROW_DOWN}\n"

  assert_contains "$OUTPUT" "No organizations with owner access found."
  assert_not_contains "$OUTPUT" "unbound variable"
}

test_failed_github_auth() {
  setup_run
  export TEST_GH_AUTH_FAIL="true"

  if printf '' | TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script succeeded after GitHub authentication failed."
  fi
  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after GitHub authentication failed."
  assert_contains "$OUTPUT" "Run 'gh auth login', then rerun."
}

test_failed_secret_upload_cleans_auth_file() {
  setup_run
  export TEST_GH_SET_FAIL="true"
  run_failure '\n\n\n\ny\n'

  [[ -f "$SECRET_INPUT" ]] || fail "The failed upload did not receive the auth file."
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The failed upload left a temporary auth file."
  fi
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The failed automatic flow used the clipboard."
}

test_remote_repository_handoff() {
  local restricted_bin

  setup_run
  restricted_bin="$RUN_ROOT/remote-bin"
  mkdir -p "$restricted_bin"
  ln -s "$(command -v bash)" "$restricted_bin/bash"
  ln -s "$(command -v dirname)" "$restricted_bin/dirname"
  ln -s "$MOCK_BIN/gh" "$restricted_bin/gh"
  RUN_PATH="$restricted_bin"
  run_success "\n\n\n${ARROW_DOWN}\n"

  assert_remote_handoff '--repo alice/alpha'
  replay_remote_command \
    $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--repo\talice/alpha'
}

assert_remote_command_fails() {
  local command

  command="$(grep -F 'bash -euo pipefail -c ' "$OUTPUT")"
  : > "$GH_LOG"
  if TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" bash -c "$command" > "$RUN_ROOT/replay-output" 2>&1; then
    fail "The generated local command succeeded unexpectedly."
  fi
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The generated command used the clipboard."
  assert_not_contains "$RUN_ROOT/replay-output" "TEST_ONLY_AUTH"
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The generated command left temporary files after failure."
  fi
}

test_remote_handoff_stops_after_failed_download() {
  setup_run
  run_success "\n\n\n${ARROW_DOWN}\n"
  export TEST_CURL_FAIL="true"
  assert_remote_command_fails
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  [[ ! -s "$NPX_LOG" ]] || fail "A failed download was executed."
  [[ ! -e "$SECRET_INPUT" ]] || fail "A failed bootstrap download uploaded a secret."
}

test_remote_selected_organization_handoff() {
  setup_run
  run_success "${ARROW_DOWN}\n\n${ARROW_DOWN}\n${ARROW_DOWN}\n"

  assert_remote_handoff '--org acme --visibility selected --repos app'
  replay_remote_command \
    $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapp'
}

test_remote_handoff_rejects_empty_file() {
  setup_run
  run_success "\n\n\n${ARROW_DOWN}\n"
  export TEST_BOOTSTRAP_EMPTY_OUTPUT="true"
  assert_remote_command_fails
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  [[ ! -e "$SECRET_INPUT" ]] || fail "The failed bootstrap uploaded a secret."
}

test_remote_handoff_stops_after_failed_login() {
  setup_run
  run_success "\n\n\n${ARROW_DOWN}\n"
  export TEST_LOGIN_FAIL="true"
  assert_remote_command_fails
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  [[ ! -e "$SECRET_INPUT" ]] || fail "The failed bootstrap uploaded a secret."
}

test_remote_handoff_cleans_files_after_failed_upload() {
  setup_run
  run_success "\n\n\n${ARROW_DOWN}\n"
  export TEST_GH_SET_FAIL="true"
  assert_remote_command_fails
  [[ -f "$SECRET_INPUT" ]] || fail "The failed upload did not receive the auth file."
}

test_local_flow_rejects_empty_auth() {
  setup_run
  export TEST_EMPTY_AUTH="true"
  run_failure '\n\n\n\ny\n'
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  [[ ! -e "$SECRET_INPUT" ]] || fail "An empty auth file was uploaded."
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The failed bootstrap left temporary files."
  fi
}

test_manual_clipboard_bootstrap() {
  setup_run
  export TEST_ALLOW_CLIPBOARD="true"

  if ! TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$BOOTSTRAP_SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Manual clipboard bootstrap exited with an error."
  fi
  [[ "$(< "$CLIPBOARD_OUTPUT")" == '{"test":"TEST_ONLY_AUTH"}' ]] || fail "Clipboard output changed."
  assert_contains "$CLIPBOARD_LOG" "pbcopy called"
  assert_not_contains "$OUTPUT" "TEST_ONLY_AUTH"
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The manual bootstrap left a temporary auth file."
  fi
}

test_personal_repository_secret
test_organization_repository_secret
test_new_organization_secret
test_existing_selected_organization_secret
test_non_ansi_menu_tracks_arrows
test_existing_private_organization_secret_is_restricted
test_existing_all_organization_secret_is_restricted
test_cancel_at_organization_selection
test_cancel_at_selected_repository_selection
test_empty_selected_organization_repository_list
test_cancel_before_login
test_cancel_at_confirmation
test_rejects_shadowed_organization_secret
test_empty_repository_list
test_empty_organization_list
test_failed_github_auth
test_failed_secret_upload_cleans_auth_file
test_remote_repository_handoff
test_remote_handoff_stops_after_failed_download
test_remote_selected_organization_handoff
test_remote_handoff_rejects_empty_file
test_remote_handoff_stops_after_failed_login
test_remote_handoff_cleans_files_after_failed_upload
test_local_flow_rejects_empty_auth
test_manual_clipboard_bootstrap

echo "setup-codex-auth-secret tests passed ($TEST_NUMBER)"
