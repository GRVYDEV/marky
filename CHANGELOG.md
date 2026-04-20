# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Text resizing and column resizing
- Copy contents as markdown
- Linux builds (.deb and AppImage) for amd64 and arm64

### Fixed
- CLI not opening files when Marky is already running
- Files not refreshing when edited from outside of Marky
- Contact link

## [0.1.1] - 2026-04-16

### Fixed
- Folders not working correctly

## [0.1.0] - 2026-04-16

### Added
- Tauri v2 desktop markdown viewer
- Folder sidebar with file tree (Obsidian-style)
- Cmd+K command palette with fuzzy search
- Split panes and tabs
- In-document search
- Syntax highlighting via Shiki
- KaTeX math rendering
- Mermaid diagram support
- Light/dark theme with shadcn UI
- File watching with live reload
- CLI launcher (`marky FILE` or `marky FOLDER`)
- Homebrew tap distribution
