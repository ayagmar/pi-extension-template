#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  create-from-template.sh <repo|owner/repo> [--public|--private|--internal] [--description TEXT] [--team NAME] [--template OWNER/REPO]

Examples:
  create-from-template.sh my-extension --private
  create-from-template.sh my-org/my-extension --public --description "Pi extension for ..."
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

detect_template_repo() {
  local origin
  origin="$(git config --get remote.origin.url || true)"

  if [[ -z "$origin" ]]; then
    return 1
  fi

  if [[ "$origin" =~ ^git@github\.com:([^/]+/[^/]+?)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "$origin" =~ ^https://github\.com/([^/]+/[^/]+?)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "$origin" =~ ^ssh://git@github\.com/([^/]+/[^/]+?)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

target=""
visibility="private"
description=""
team=""
template=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public)
      visibility="public"
      shift
      ;;
    --private)
      visibility="private"
      shift
      ;;
    --internal)
      visibility="internal"
      shift
      ;;
    --description)
      [[ $# -ge 2 ]] || die "--description requires a value"
      description="$2"
      shift 2
      ;;
    --team)
      [[ $# -ge 2 ]] || die "--team requires a value"
      team="$2"
      shift 2
      ;;
    --template)
      [[ $# -ge 2 ]] || die "--template requires a value"
      template="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      die "Unknown option: $1"
      ;;
    *)
      if [[ -n "$target" ]]; then
        die "Only one target repository may be provided"
      fi
      target="$1"
      shift
      ;;
  esac
done

[[ -n "$target" ]] || {
  usage
  exit 2
}

require_command gh
require_command git
require_command node

gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run 'gh auth login' first."

default_template=""
should_cleanup=0

if [[ -z "$template" ]]; then
  default_template="$(detect_template_repo)" ||
    die "Could not determine template repo from git origin. Pass --template OWNER/REPO."
  template="$default_template"
  should_cleanup=1
elif default_template="$(detect_template_repo)"; then
  if [[ "$template" == "$default_template" ]]; then
    should_cleanup=1
  fi
fi

repo_dir="${target##*/}"
[[ ! -e "$repo_dir" ]] || die "Target directory already exists: $repo_dir"

create_args=(repo create "$target" "--$visibility" --template "$template" --clone)

if [[ -n "$description" ]]; then
  create_args+=(--description "$description")
fi

if [[ -n "$team" ]]; then
  create_args+=(--team "$team")
fi

gh "${create_args[@]}"

if [[ "$should_cleanup" -eq 1 ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  node "$script_dir/cleanup-generated-repo.mjs" "$repo_dir"

  (
    cd "$repo_dir"

    if [[ -n "$(git status --short)" ]]; then
      git add -A
      git commit -m "chore: remove template bootstrap skill"
      git push
    fi
  )
else
  echo "Skipping bootstrap cleanup because --template points to a different repository." >&2
fi

echo
echo "Created $target from template $template"
echo "Local clone: $repo_dir"
echo "Next steps:"
echo "  cd $repo_dir"
echo "  pnpm install"
echo "  pnpm run setup-template"
echo "  pnpm run check"
