"""Cover composite Docker steps missed by zizmor's unpinned-images audit."""

from pathlib import Path
import re
import subprocess
import sys

import yaml


def violations(source):
    action = yaml.safe_load(source)
    if not isinstance(action, dict):
        return []
    runs = action.get("runs", {})
    if not isinstance(runs, dict) or runs.get("using") != "composite":
        return []
    errors = []
    for index, step in enumerate(runs.get("steps", []), start=1):
        reference = step.get("uses", "") if isinstance(step, dict) else ""
        if isinstance(reference, str) and reference.startswith("docker://"):
            if not re.fullmatch(r"docker://[^\s@]+@sha256:[0-9a-f]{64}", reference):
                errors.append(f"step {index}: Docker action requires a SHA-256 digest")
    return errors


def main():
    files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
    failed = False
    for name in files:
        path = Path(name)
        if path.name not in {"action.yml", "action.yaml"}:
            continue
        try:
            errors = violations(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, yaml.YAMLError, TypeError):
            errors = ["cannot parse action metadata"]
        for error in errors:
            print(f"{path}: {error}", file=sys.stderr)
            failed = True
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
