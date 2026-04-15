#!/usr/bin/env bash
# Install the `marky` CLI by symlinking the built binary into ~/.local/bin.
# Run after `pnpm tauri build`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_NAME="marky"
TARGET_DIR="$HOME/.local/bin"
LINK="$TARGET_DIR/$BIN_NAME"

# Locate the built binary. Prefer the bundled .app on macOS so the GUI launches
# through the bundle; fall back to the raw target binary otherwise.
candidates=(
  "$ROOT/src-tauri/target/release/bundle/macos/Marky.app/Contents/MacOS/marky"
  "$ROOT/src-tauri/target/release/marky"
  "$ROOT/src-tauri/target/debug/marky"
)

binary=""
for c in "${candidates[@]}"; do
  if [[ -x "$c" ]]; then
    binary="$c"
    break
  fi
done

if [[ -z "$binary" ]]; then
  echo "error: no built marky binary found." >&2
  echo "build first with: pnpm tauri build" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
ln -sfn "$binary" "$LINK"

echo "linked $LINK -> $binary"

case ":$PATH:" in
  *":$TARGET_DIR:"*)
    echo "ready: run 'marky FILE.md' or 'marky DIR/'"
    ;;
  *)
    echo "warning: $TARGET_DIR is not on PATH"
    echo "  add this to your shell profile (~/.zshrc, ~/.bashrc, ~/.config/fish/config.fish):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac
