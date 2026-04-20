#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 0.2.0"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be in semver format (X.Y.Z), got: $VERSION"
  exit 1
fi

echo "Bumping version to $VERSION"
echo ""
echo "Files to update:"
echo "  package.json"
echo "  src-tauri/tauri.conf.json"
echo "  src-tauri/Cargo.toml"
echo "  src-tauri/Cargo.lock (via cargo check)"
echo ""
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

echo ""

# package.json
echo "Updating package.json..."
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/package.json"

# tauri.conf.json
echo "Updating src-tauri/tauri.conf.json..."
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"

# Cargo.toml — only the package version (line 3)
echo "Updating src-tauri/Cargo.toml..."
sed -i '' "3s/version = \"[0-9]*\.[0-9]*\.[0-9]*\"/version = \"$VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

# Regenerate Cargo.lock
echo "Running cargo check to update Cargo.lock..."
(cd "$ROOT_DIR/src-tauri" && cargo check --quiet)

# Commit and tag
echo "Committing..."
git -C "$ROOT_DIR" add \
  package.json \
  src-tauri/tauri.conf.json \
  src-tauri/Cargo.toml \
  src-tauri/Cargo.lock

git -C "$ROOT_DIR" commit -m "v$VERSION"

echo "Tagging v$VERSION..."
git -C "$ROOT_DIR" tag "v$VERSION"

echo "Pushing..."
git -C "$ROOT_DIR" push
git -C "$ROOT_DIR" push --tags

echo ""
echo "Done! v$VERSION released."
