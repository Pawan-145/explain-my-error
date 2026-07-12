# Changelog

All notable changes to this extension are documented here.

## [0.0.1] - Initial release

- Local rule-based matching for ~35 common Node/npm, Python, git, and general OS errors.
- Plain-English explanation card: What happened / Why / How to fix.
- Manual "Explain Selected Text" command.
- Auto-detect on terminal command failure (via VS Code's Terminal Shell Integration API), with a dismissible prompt.
- Optional, opt-in AI fallback for errors not covered by the local database. Off by default. Requires user's own API key, stored via Secret Storage.
