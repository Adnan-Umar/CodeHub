# Contributing to CodeHub

Thank you for your interest in contributing to CodeHub! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Environment Setup](#development-environment-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Reporting Issues](#reporting-issues)
- [Project Architecture](#project-architecture)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 9 or higher
- **Google Chrome**: Version 88 or higher (for extension testing)
- **Git**: For version control

### Installation

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/CodeHub.git
   cd CodeHub
   ```

3. **Install development dependencies**:
   ```bash
   npm run setup
   ```

4. **Set up OAuth credentials** (required for extension testing):
   
   Create a `.env` file in the project root:
   ```bash
   cp .env.example .env  # If .env.example exists
   ```
   
   Or manually create `.env`:
   ```
   CLIENT_ID=your_github_oauth_client_id
   CLIENT_SECRET=your_github_oauth_client_secret
   ```
   
   > **Note**: `.env` is gitignored and should never be committed. For extension testing, you must also update the hardcoded values in `src/js/authorize.js` and `src/js/oauth2.js` with your own OAuth app credentials.

5. **Load the extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right)
   - Click **Load unpacked**
   - Select the CodeHub project folder
   - The extension icon should appear in your toolbar

### Available npm Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install all dependencies |
| `npm run format` | Auto-format all source files with Prettier |
| `npm run format-test` | Check if files are formatted correctly |
| `npm run lint` | Lint and auto-fix JavaScript files |
| `node scripts/test-core-logic.mjs` | Run core logic smoke tests |

## Coding Standards

### JavaScript Style Guide

- **No framework**: Pure vanilla JavaScript
- **jQuery**: Vendored in `src/js/static/` for popup/welcome UI
- **Semicolons**: Required
- **Quotes**: Single quotes preferred
- **Print width**: 100 characters
- **Trailing commas**: As per Prettier default

### File Organization

```
src/
├── css/           # Stylesheet files
├── html/          # HTML templates (popup, welcome pages)
└── js/
    ├── static/    # Vendored libraries (gitignored from linting)
    └── *.js       # Platform modules (leetcode.js, hackerrank.js, etc.)
```

### Key Files Reference

| File | Purpose |
|------|---------|
| `src/js/interceptor.js` | MAIN-world fetch/XHR interceptor |
| `src/js/github.js` | Shared GitHub utilities |
| `src/js/leetcode.js` | LeetCode platform implementation |
| `src/js/hackerrank.js` | HackerRank platform implementation |
| `src/js/geeksforgeeks.js` | GeeksForGeeks platform implementation |
| `src/js/codingninja.js` | Code360 platform implementation |
| `src/js/background.js` | MV3 service worker for GitHub API proxy |
| `src/js/popup.js` | Extension popup UI logic |
| `src/js/welcome.js` | Welcome/setup page logic |

### Code Quality Requirements

- [ ] All code must pass ESLint: `npm run lint`
- [ ] All code must be formatted with Prettier: `npm run format`
- [ ] All new logic must include tests in `scripts/test-core-logic.mjs`
- [ ] No console.log statements in production code (use `console.warn` or `console.error` for errors)

### Naming Conventions

- **Platform detection functions**: `handle{Platform}Submission()`
- **Event names**: Prefixed with `codehub-` (e.g., `codehub-submit-success`)
- **Storage keys**: Prefixed with `codehub-` (e.g., `codehub_token`, `codehub_hook`)
- **Message passing**: Use consistent event detail structure

## Testing

### Running Tests

```bash
# Run all tests
node scripts/test-core-logic.mjs

# Or with verbose output
node scripts/test-core-logic.mjs --verbose
```

### Test Categories

The test suite covers:
- Path building for GitHub uploads
- SHA resolution and conflict handling
- Submission ID parsing
- Platform-specific extraction logic

### Writing Tests

Add tests to `scripts/test-core-logic.mjs`. Each test should:
1. Have a descriptive name
2. Test a single unit of functionality
3. Clean up any state changes after completion
4. Use the existing test harness pattern

## Submitting Pull Requests

### Branch Strategy

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make small, focused commits**:
   ```bash
   git add src/js/leetcode.js
   git commit -m "feat: add support for LeetCode premium problems"
   ```

3. **Commit message format**:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactoring
   - `test:` for test additions
   - `chore:` for maintenance tasks

### PR Checklist

- [ ] Branch is up to date with `main` (`git pull upstream main`)
- [ ] Code passes lint: `npm run lint`
- [ ] Code is formatted: `npm run format`
- [ ] Tests pass: `node scripts/test-core-logic.mjs`
- [ ] New code has corresponding tests
- [ ] README updated (if adding/modifying features)
- [ ] Commit message is clear and descriptive

### Pull Request Process

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a pull request on GitHub against the `main` branch

3. Fill out the PR template (if available) with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (if UI changes)

4. Wait for review from maintainers

5. Address review feedback with additional commits (not amended commits unless requested)

## Reporting Issues

### Bug Reports

Use the [bug report template](https://github.com/Adnan-Umar/CodeHub/issues/new?template=bug_report.md) and include:

- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Browser version and extension version

### Feature Requests

Use the [feature request template](https://github.com/Adnan-Umar/CodeHub/issues/new?template=feature_request.md) and include:

- Problem you're trying to solve
- Proposed solution
- Alternatives considered

### Security Vulnerabilities

Report security issues via the [Security Policy](SECURITY.md) instead of public issues.

## Project Architecture

CodeHub uses Chrome Manifest V3 (MV3) with:

1. **Service Worker** (`background.js`): Proxies GitHub API requests, handles message routing
2. **MAIN-world interceptor** (`interceptor.js`): Overrides fetch/XHR to intercept platform API calls
3. **Isolated content scripts**: Platform-specific detection and upload logic

Key architectural decisions:
- Interceptor runs at `document_start` in MAIN world for network call interception
- Platform scripts run at `document_idle` in isolated world
- Cross-world communication via `window.postMessage` and `CustomEvent`
- Files are uploaded via GitHub Contents API with SHA-based conflict resolution

## Getting Help

- Check existing [issues](https://github.com/Adnan-Umar/CodeHub/issues) before opening new ones
- Look for `help wanted` or `good first issue` labels for beginner-friendly tasks
- For questions, use [GitHub Discussions](https://github.com/Adnan-Umar/CodeHub/discussions) (if enabled)

---

Thanks for contributing to CodeHub! 🎉