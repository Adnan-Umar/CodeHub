<div align="center">
    <img src="assets/logo.png" alt="CodeHub" width="200">
</div>

<p align="center">
  <a href="https://github.com/Adnan-Umar/CodeHub/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"/>
  </a>
  <a href="https://github.com/Adnan-Umar/CodeHub/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/Adnan-Umar/CodeHub" />
  </a>
  <a href="https://github.com/Adnan-Umar/CodeHub/releases">
    <img src="https://img.shields.io/github/v/release/Adnan-Umar/CodeHub" />
  </a>
  <a href="https://github.com/Adnan-Umar/CodeHub/issues">
    <img src="https://img.shields.io/github/issues/Adnan-Umar/CodeHub" />
  </a>
</p>

<h1 align="center">CodeHub</h1>

<p align="center">
  <b>Automatically sync your accepted coding solutions from multiple platforms to GitHub.</b>
</p>

<p align="center">
  A multi-platform evolution of <a href="https://github.com/Adnan-Umar/CodeHub">CodeHub</a>,
  extended to support HackerRank, GeeksForGeeks, and Coding Ninjas / Code360.
</p>

---

## Table of Contents

- [What is CodeHub?](#what-is-codehub)
- [Why CodeHub?](#why-codehub)
- [Supported Platforms](#supported-platforms)
- [Features](#features)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Installation](#installation)
- [Setup Guide](#setup-guide)
- [Usage](#usage)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## What is CodeHub?

CodeHub is a **Chrome Manifest extension** that automatically detects when you submit an accepted solution on a supported coding platform and pushes the code to your linked GitHub repository. Each platform gets its own folder, and difficulty subfolders are created automatically if enabled.

```
GitHub Repository/
├── LeetCode/
│   ├── Easy/
│   ├── Medium/
│   └── Hard/
├── HackerRank/
├── GeeksForGeeks/
└── Code360/
```

Key behaviors:

- **Automatic directory creation** — CodeHub checks whether the platform folder (and difficulty subfolder) exists on GitHub before every upload. If it doesn't, a `.gitkeep` placeholder is pushed to initialize it.
- **Deduplication** — Concurrent or duplicate uploads for the same problem are detected and skipped.
- **Multi-UI support** — LeetCode's legacy UI and modern dynamic UI are both handled.
- **Manual override** — Every platform has a manual "Push" button in its toolbar for cases where auto-detection misses.

---

## Why CodeHub?

Managing a coding portfolio across multiple platforms is tedious:

- LeetCode, HackerRank, GFG, and Code360 each have their own interface
- Manually copy-pasting code to GitHub after every accepted submission is repetitive and error-prone
- There is no unified dashboard that pulls all your solutions into one repository

CodeHub solves this by:

1. Running entirely in your browser — no server, no SaaS, no monthly fee
2. Authenticating directly with GitHub's OAuth API using your own app credentials
3. Pushing code to **your** repository in real time
4. Organizing everything into clean, per-platform directory structures

---

## Supported Platforms

| Platform                    | URL Pattern                                   | Folder           | Difficulty Detection       | Notes                               |
| --------------------------- | --------------------------------------------- | ---------------- | -------------------------- | ----------------------------------- |
| **LeetCode.com**            | `leetcode.com/problems/{slug}`                | `LeetCode/`      | Yes (Easy / Medium / Hard) | Supports legacy + dynamic UI        |
| **LeetCode.cn**             | `leetcode.cn/problems/{slug}`                 | `LeetCode/`      | Yes                        | Chinese mirror                      |
| **HackerRank**              | `hackerrank.com/challenges/{slug}`            | `HackerRank/`    | Yes (Easy / Medium / Hard) | Manual push button in toolbar       |
| **GeeksForGeeks**           | `geeksforgeeks.org/problems/{slug}`           | `GeeksForGeeks/` | Yes (Easy / Medium / Hard) | Manual push button + API interception |
| **Coding Ninjas / Code360** | `codingninjas.com/codestudio/problems/{slug}` | `Code360/`       | Yes (Easy / Medium / Hard) | Manual push button in toolbar       |

> **Feature parity:** HackerRank, GeeksForGeeks, and Code360 share the same
> upload pipeline as LeetCode — stats counters, custom commit messages,
> difficulty/language subfolders, timestamped filenames, and per-problem
> READMEs. See [Shared Features](#shared-features) below.

---

## Features

### Core Functionality

- **Automatic submission detection** — Intercepts GraphQL and REST API calls via `fetch` and `XMLHttpRequest` overrides to detect accepted submissions without polling the DOM.
- **Cross-world event bridge** — MAIN-world interceptor (`document_start`) communicates with isolated content scripts via `window.postMessage` and `CustomEvent` dispatch.
- **GitHub directory auto-creation** — Uses the GitHub Contents API to create platform directories on demand.
- **SHA-based conflict resolution** — Reads the existing file SHA before updating; retries with the correct SHA on HTTP 409.
- **Concurrent upload guard** — An in-progress Set prevents the same problem from being uploaded simultaneously from overlapping observer/poll callbacks.
- **Timeout with direct fallback** — `codehubGithubFetch` routes through the background service worker with a 30-second timeout; on failure it falls back to a direct `fetch` to `api.github.com` (allowed by `host_permissions`).

### Per-Platform Details

#### LeetCode

- **LeetCodeV1** — legacy UI: watches `.success__3Ai7` and `#result-state` elements, reads submission page via GraphQL.
- **LeetCodeV2** — dynamic UI: watches `[data-e2e-locator="submission-result"]`, validates text content (`Accepted`, `Success`, `Done`).
- **Manual Push button** — injected next to the bookmarks icon; right-click adds a suffix (e.g. `-bfs`).
- **Topic READMEs** — auto-generates per-topic README sections from `questionDetails.topicTags`.
- **Notes support** — optional `NOTES.md` upload per problem.

#### HackerRank

- **Detection** — Interceptor captures all HR API responses; `MutationObserver` + 1.5s polling scans for "Accepted" / "Congratulations" text nodes.
- **Editor extraction** — Multi-strategy: shadow DOM recursive search (depth 5), global `window.monaco.editor.getModels()`, `[contenteditable]` divs, `.monaco-container` textareas, CodeMirror, Ace.
- **Response cache bridge** — The interceptor (MAIN world) caches captured request/response pairs in `window.__codehubHrCache` and `localStorage`, which the isolated content script reads as a fallback when the editor DOM is unreachable.
- **Manual Push button** — injected next to the Submit button; right-click for file suffix.

#### GeeksForGeeks

- **Detection** — Interceptor evaluates all GFG domain responses for accepted verdicts.
- **Editor extraction** — Shadow DOM recursive search, Monaco → CodeMirror → Ace → textarea fallback chain, with retry loop (`getGFGCodeWithRetry`) for slow-loading editors.
- **Manual Push button** — injected next to the Submit button; right-click for file suffix.
- **Polling** — 2-second interval for 30 cycles scanning leaf text nodes for "Accepted" / "Congratulations".
- **Difficulty detection** — Scraped from the problem header into Easy / Medium / Hard.

#### Code360 (Coding Ninjas)

- **Detection** — Interceptor captures all `codingninjas.com` and `naukri.com/code360` responses.
- **Editor extraction** — Monaco `getModels()` / `getEditors()`, CodeMirror, textarea fallbacks, with retry loop (`getCode360CodeWithRetry`).
- **Manual Push button** — injected next to the Submit button; right-click for file suffix.
- **Polling** — same pattern as GFG.
- **Difficulty detection** — Best-effort scan of the problem page text.

### Shared Features

All four platforms (LeetCode, HackerRank, GeeksForGeeks, Code360) now share the
same upload pipeline (`codehubPushSolution` in `src/js/github.js`), so they all
support the following options configured from the extension popup:

| Feature                     | Toggled by                  | Effect                                                                                  |
| --------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| Difficulty subfolder        | *Use Difficulty Subfolder*  | Files land in `{Platform}/{Difficulty}/{problem}/{file}`                                |
| Language subfolder          | *Use Language Subfolder*    | Files land in `{Platform}/{Language}/{Difficulty}/{problem}/{file}`                     |
| Timestamped filenames       | *Enable Timestamped Filenames* | Saves versions as `{problem}_{MM-DD-YYYY}_{hh-mm-ss}{ext}`                           |
| Custom commit message       | *Customize Commit Message*  | Template with `{time}`, `{space}`, `{language}`, `{problemName}`, `{difficulty}`, `{date}`, `{problemTopic}` |
| Solved / difficulty counters| (always on)                 | Increments the popup stats on every newly accepted problem                              |
| Per-problem README          | (always on)                 | `README.md` with title, difficulty, URL, and platform badge                             |
| Manual Push button          | (always on)                 | Toolbar button + right-click suffix on every platform                                   |

### Quality-of-Life

- **Progress indicators** — CSS-animated spinners injected next to each platform's submit button; ✅ (green) or ❌ (red) on completion.
- **Prettier + ESLint** — CI-ready formatting and linting (`npm run lint`, `npm run format`).
- **Core logic tests** — Node.js smoke tests for path building, SHA resolution, and submission ID parsing (`node scripts/test-core-logic.mjs`).

---

## Project Structure

```
codehub/
├── assets/
│   ├── extension/            # Browser extension screenshots (1.png – 4.png)
│   ├── logo.png              # Extension logo
│   └── thumbnail.png         # Chrome Web Store icon
├── src/
│   ├── css/
│   │   ├── popup.css         # Styles for extension popup
│   │   └── welcome.css       # Styles for welcome/setup page
│   ├── html/
│   │   ├── popup.html        # Extension popup UI (auth, settings, stats)
│   │   └── welcome.html      # Welcome/setup page (repo creation/linking)
│   └── js/
│       ├── static/           # Vendored libraries (gitignored from linting)
│       │   ├── jquery-3.3.1.min.js
│       │   └── semantic-2.4.1.min.js
│       ├── authorize.js      # OAuth callback handler (code → token exchange)
│       ├── background.js     # MV3 service worker; GitHub API proxy + message router
│       ├── codingninja.js    # Code360 platform: detection, extraction, upload
│       ├── github.js         # Shared GitHub utilities: fetch proxy, upload, directory creation, dedup
│       ├── geeksforgeeks.js  # GFG platform: detection, extraction, upload
│       ├── hackerrank.js     # HackerRank platform: detection, extraction, upload, manual button
│       ├── interceptor.js    # MAIN-world fetch/XHR interceptor; event emitter for all platforms
│       ├── leetcode.js       # LeetCode V1+V2: DOM watching, GraphQL, manual push, README topics
│       ├── oauth2.js         # OAuth2 initiation (GitHub authorization URL builder)
│       ├── popup.js           # Popup page logic (jQuery-driven UI)
│       └── welcome.js         # Welcome page logic (repo CRUD, GitHub API calls)
├── .env                       # Local OAuth credentials (gitignored)
├── .gitignore                 # Ignores .env, node_modules, build/, .vscode, release/
├── .prettierignore
├── .prettierrc                 # Prettier config: singleQuote, semi, printWidth 100
├── eslint.config.js            # ESLint flat config (recommended + prettier + globals)
├── manifest.json               # Chrome extension manifest (MV3)
├── package.json                # Node.js project config (eslint, prettier)
├── package-lock.json           # Dependency lockfile
├── README.md                   # This file
└── scripts/
    └── test-core-logic.mjs     # Node.js smoke tests for path building + submission parsing
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CodeHub Data Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LeetCode                    HackerRank / GFG / Code360            │
│  ──────────                   ────────────────────────────         │
│  Submit click                API response intercepted              │
│       │                       by interceptor.js (MAIN world)       │
│       ▼                       │                                     │
│  loader(leetCode)             ▼                                     │
│  ─── checks success state     detail.code extracted                │
│  ─── GraphQL for full page    from request body / response cache    │
│  ─── buildGitHubPath()        │                                     │
│  ─── uploadGit()              ▼                                     │
│       │                    handleHackerRankSubmission()            │
│       ▼                       handleGFGSubmission()                │
│  github.js                    handleCode360Submission()             │
│  ─── ensureGitDirectory()         │                                 │
│  ─── githubUpload() /            ▼                                 │
│      codehubGithubFetch()   codehubPushSolution()                  │
│       │                       │                                   │
│       ▼                       ▼                                   │
│  background.js (proxy)    background.js (proxy)                    │
│       │                       │                                   │
│       ▼                       ▼                                   │
│  ──► api.github.com/       ──► api.github.com/                    │
│      repos/{user}/{repo}/       repos/{user}/{repo}/               │
│      contents/.../              contents/.../                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Manifest Design

CodeHub uses Chrome Manifest, which enforces a strict separation between:

1. **Service Worker** (`background.js`) — a short-lived worker that proxies GitHub API requests. It cannot directly access DOM, but it can use `fetch` and `chrome.*` APIs.
2. **Content Scripts** — injected into supported platform pages:
   - **`interceptor.js`** runs at `document_start` in the **MAIN world** (`"world": "MAIN"`). This is essential: it overrides `window.fetch` and `XMLHttpRequest.prototype` in the page's own JavaScript context, so it can intercept network calls made by the platform's own scripts.
   - All other scripts (`github.js`, `leetcode.js`, `hackerrank.js`, `geeksforgeeks.js`, `codingninja.js`) run at `document_idle` in the **isolated content script world**. They share the DOM with the page but run in a separate JavaScript scope.
3. **Cross-world communication** — Since MAIN-world and isolated-world scripts cannot directly share JS variables, CodeHub uses two bridges:
   - `window.postMessage({ source: 'codehub-extension', event, detail })` — MAIN → isolated
   - `window.dispatchEvent(new CustomEvent(event, { detail }))` — isolated → isolated (same world)
4. **Content Security Policy** — `"script-src 'self'; object-src 'self'"` restricts inline scripts and external script loading.

### GitHub Upload Pipeline

```
codehubPushSolution (github.js)
  │
  ├─ chrome.storage.local.get('codehub_token', 'mode_type', 'codehub_hook', ...)
  │
  ├─ ensureGitDirectory() ──► GitHub API PUT .gitkeep (creates folder)
  │
  ├─ uploadWithRetry(sha)
  │     ├─ githubUpload() ──► codehubGithubFetch() ──► background.js ──► api.github.com
  │     └─ on 409: githubGetFile() ──► retry with latest SHA
  │
  ├─ Promise.all([ code upload, README upload ])
  │
  └─ update chrome.storage.local stats
```

### Why Manifest V3 (and not V2/V1)

| Aspect                | MV1                        | MV2                      | MV3 (current)            |
| --------------------- | -------------------------- | ------------------------ | ------------------------ |
| Chrome support        | Chrome ≤ 17 only           | Phased out (Chrome 115+) | Current standard         |
| Chrome Web Store      | Not accepted               | Not accepted (2023+)     | Required                 |
| Background            | Persistent page            | Persistent page          | Ephemeral service worker |
| Content script worlds | Isolated only              | Isolated only            | Isolated + MAIN world    |
| `host_permissions`    | No                         | No                       | Yes (separate key)       |
| `service_worker`      | No                         | No                       | Yes                      |
| CodeHub compatibility | Would require full rewrite | Possible but deprecated  | Native                   |

**Downgrade assessment:**

- **MV1**: Impossible. No modern browser supports it.
- **MV2**: Technically feasible (fetch/XHR overrides work in isolated worlds), but MV2 is being actively removed from Chrome. New extensions cannot be published as MV2.
- **MV3**: Required for Chrome Web Store publishing and long-term browser compatibility. The `"world": "MAIN"` feature is uniquely MV3 and critical for the interceptor's fetch/XHR overrides to intercept page-level network calls.

---

## Installation

### Prerequisites

- Google Chrome (version 88+ recommended for full MV3 support)
- A GitHub account
- A GitHub OAuth App (created by you)

### Step 1: Clone the Repository

```bash
git clone https://github.com/Adnan-Umar/CodeHub.git
cd CodeHub
```

### Step 2: Install Dependencies

```bash
npm run setup
# or
npm i
```

This installs development dependencies (ESLint, Prettier).

### Step 3: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in the fields:

   | Field                      | Value                                            |
   | -------------------------- | ------------------------------------------------ |
   | Application name           | `CodeHub`                                        |
   | Homepage URL               | `https://github.com/Adnan-Umar/CodeHub`          |
   | Application description    | `Automatically syncs coding solutions to GitHub` |
   | Authorization callback URL | `https://github.com/`                            |
   | Enable Device Flow         | **Unchecked**                                    |

4. Click **Register application**
5. Copy the generated **Client ID** and **Client Secret**

### Step 4: Configure Credentials

Edit the following two files and replace the placeholder credentials with your own:

**`src/js/authorize.js`** (around line 10):

```javascript
this.CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
this.CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
```

**`src/js/oauth2.js`** (around line 5):

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
```

> **Security note:** Never commit your real `CLIENT_SECRET` to a public repository. The `.env` file is gitignored for this purpose. For personal use, hardcoding in these two files is acceptable. For distribution, consider a build-time injection step.

### Step 5: Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the `codehub` project folder
5. The CodeHub icon should appear in your Chrome toolbar

---

## Setup Guide

After loading the extension:

### 1. Authenticate with GitHub

1. Click the **CodeHub** icon in the Chrome toolbar
2. Click **Authenticate with GitHub**
3. You will be redirected to GitHub's OAuth consent screen
4. Click **Authorize CodeHub**
5. You will be redirected back and the popup will show your GitHub username

### 2. Link a Repository

1. In the extension popup, click **Get Started**
2. Choose one of:
   - **Create new repository** — CodeHub creates a private repo on your account
   - **Link existing repository** — select from your existing repos
3. The extension switches to **Commit Mode** (uploads are active)

### 3. Configure (Optional)

In the extension popup:

- **Difficulty folder** — toggle to organize LeetCode solutions into `Easy/`, `Medium/`, `Hard/` subfolders
- **Custom commit message** — use `{time}` and `{space}` placeholders
- **Stats** — view your total solved count per difficulty

---

## Usage

### Automatic Upload (Recommended)

Once authenticated and linked to a repo:

1. Navigate to any supported platform (LeetCode, HackerRank, GFG, Code360)
2. Solve a problem and submit your code
3. If the judge returns **Accepted**:
   - A spinner appears next to the submit button
   - Code is pushed to the corresponding folder in your GitHub repo
   - Spinner turns green (✅) on success or red (❌) on failure
4. If the judge returns anything else:
   - Nothing is pushed (no spam commits)

### Manual Push (Fallback)

If automatic detection misses a submission:

#### LeetCode

- A **Push** button (Git icon) appears next to the bookmark icon on problem pages
- Left-click: upload current code
- Right-click: add a file suffix (e.g. `-bfs`, `-dfs`)

#### HackerRank

- A **Push to GitHub** button appears in the editor toolbar next to Submit
- Same left-click / right-click behavior as LeetCode

#### GeeksForGeeks / Code360

- Use the LeetCode manual push pattern or wait for the MutationObserver to catch the result

### What Gets Uploaded

For each accepted submission, CodeHub pushes:

| File                   | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `{problem-slug}.{ext}` | Your solution code (extension mapped from language)                |
| `README.md`            | Per-problem README with title, URL, difficulty, and platform badge |

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Available npm Scripts

```bash
# Install dependencies
npm run setup

# Auto-format all source files (JS, HTML, CSS)
npm run format

# Check if files are formatted correctly
npm run format-test

# Lint and auto-fix JavaScript (ignores vendored libs)
npm run lint

# Check lint without fixing
npx eslint src/js/ --ignore-pattern 'src/js/static/*'

# Run core logic smoke tests
node scripts/test-core-logic.mjs
```

### Project Conventions

- **ESLint** flat config (`eslint.config.js`) with `@eslint/js` recommended + Prettier plugin
- **Prettier**: single quotes, semicolons, 100 char print width, trailing commas
- **No framework** — pure vanilla JS, jQuery (vendored), Semantic UI (vendored)
- **Platform scripts** share globals from `github.js` (e.g. `window.codehubPushSolution`, `window.listenCodeHubEvents`)

### Key Implementation Notes

1. **Content script order matters.** `interceptor.js` runs at `document_start` (before any page JS loads), followed by all platform scripts at `document_idle`.
2. **Cross-world communication.** The interceptor runs in the MAIN world; platform scripts run in the isolated world. They communicate via `window.postMessage` + `CustomEvent`.
3. **Service worker ephemerality.** MV3 service workers can be killed by the browser at any time. `codehubPushSolution` uses a `_inProgress` Set and a 30-second timeout with direct `fetch` fallback to handle this.
4. **Shadow DOM piercing.** HackerRank and GFG use Web Components with shadow DOMs. Code extraction recurses up to depth 5 into `shadowRoot` trees to find Monaco/Ace/CodeMirror instances.
5. **XHR responseType guard.** Some platforms set `xhr.responseType = 'blob'`, which makes `xhr.responseText` inaccessible. The interceptor guards against this.

---

## Troubleshooting

### Extension not loading / manifest error

- Ensure you are using Chrome 88+
- Check `chrome://extensions/` → CodeHub → **Errors**
- Verify `manifest.json` is valid JSON (no trailing commas, no comments)

### "Could not extract solution code" (HackerRank / GFG)

- These platforms use shadow DOM and modern editors that are often inaccessible from content scripts
- Use the **Manual Push button** in the platform's toolbar (bypasses the interceptor entirely)
- Ensure you have waited for the editor to fully load before clicking Submit

### "Extension context invalidated"

- The MV3 service worker restarted during upload. This is handled automatically with retries.
- If it persists, click **Reload** on the extension card at `chrome://extensions/`

### Upload fails with 409 Conflict

- CodeHub automatically fetches the latest SHA and retries
- If it still fails, check that your token has `repo` scope on GitHub

### LeetCode shows "Done" but nothing pushed

- Verify the extension is in **commit mode** (not view mode) in the popup
- Check DevTools Console for `[CodeHub]` prefixed log messages
- Try the manual Push button next to the bookmark icon

---

## Security

### OAuth Credentials

- **Client ID** and **Client Secret** are stored in `src/js/authorize.js` and `src/js/oauth2.js`
- The `.env` file is gitignored and serves as a reference for your credentials
- **Never** commit real `CLIENT_SECRET` values to a public repository

### Data Handling

- CodeHub runs **entirely client-side** — no data is sent to any third-party server except GitHub's API
- GitHub tokens are stored in `chrome.storage.local` (extension-scoped, not accessible to web pages)
- No analytics, telemetry, or external network calls beyond GitHub

### Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

- No inline scripts
- No external script loading
- All code is bundled in the extension package

---

## Contributing

Pull requests are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Run the linter: `npm run lint`
4. Run tests: `node scripts/test-core-logic.mjs`
5. Commit with a descriptive message
6. Push to your fork and open a PR

### Reporting Bugs

Use the [bug report template](https://github.com/Adnan-Umar/CodeHub/issues/new?template=bug_report.md).

### Requesting Features

Use the [feature request template](https://github.com/Adnan-Umar/CodeHub/issues/new?template=feature_request.md).

---

## License

This project is licensed under the MIT License. See [LICENSE](https://github.com/Adnan-Umar/CodeHub/blob/main/LICENSE) for details.

---

## Acknowledgments

- Original project: [CodeHub](https://github.com/Adnan-Umar/CodeHub) by Adnan Umar
- Icons and UI components from [Semantic UI](https://semantic-ui.com/)
- Monaco Editor integration via [monaco-editor](https://microsoft.github.io/monaco-editor/)
