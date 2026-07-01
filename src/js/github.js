/**
 * Shared GitHub upload utilities for CodeHub multi-platform support.
 * Loaded before all platform-specific content scripts.
 *
 * Functions are exposed as globals (window.*) so they are accessible
 * from leetcode.js, hackerrank.js, geeksforgeeks.js, and codingninja.js.
 */

const CODEHUB_MESSAGE_SOURCE = 'codehub-extension';

window.__codehubCodeCache = window.__codehubCodeCache || {
  hackerrank: null,
  gfg: null,
  codingninjas: null,
  lastUpdated: 0,
};

/**
 * Proxies GitHub API requests through the background service worker so
 * uploads work reliably under Manifest V3 host permission rules.
 */
async function codehubGithubFetch(url, options = {}, timeoutMs = 30000) {
  let timedOut = false;

  const messagePromise = chrome.runtime
    .sendMessage({
      type: 'CODEHUB_GITHUB_REQUEST',
      payload: {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
      },
    })
    .then(response => {
      if (timedOut) return null;
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      if (!response) {
        throw new Error('No response from CodeHub background worker');
      }
      if (response.error) {
        throw new Error(response.error);
      }
      return response;
    })
    .catch(err => {
      if (timedOut) return null;
      throw err;
    });

  const timerHandle = setTimeout(() => {
    timedOut = true;
  }, timeoutMs);

  let result;
  try {
    result = await messagePromise;
  } finally {
    clearTimeout(timerHandle);
  }

  if (result) return result;

  // Timed out — fallback to direct fetch (allowed by host_permissions)
  console.warn(`[CodeHub] Background worker timed out, falling back to direct fetch`);
  const controller = new AbortController();
  const fallbackTimeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const directRes = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: options.headers?.Authorization || '',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: controller.signal,
    });
    clearTimeout(fallbackTimeoutId);
    const text = await directRes.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: directRes.ok, status: directRes.status, json, text };
  } catch (directErr) {
    clearTimeout(fallbackTimeoutId);
    throw new Error(
      `GitHub API request failed: timed out after ${timeoutMs}ms. Direct fallback also failed: ${directErr.message}`,
    );
  }
}

async function codehubGithubJson(url, options = {}) {
  const response = await codehubGithubFetch(url, options);
  if (!response.ok) {
    const err = new Error(String(response.status));
    err.responseText = response.text;
    throw err;
  }
  return response.json;
}

/**
 * Bridges events from the MAIN-world interceptor to isolated content scripts.
 */
function listenCodeHubEvents(eventHandlers) {
  window.addEventListener('message', event => {
    if (event.data?.source !== CODEHUB_MESSAGE_SOURCE) {
      return;
    }
    const handler = eventHandlers[event.data.event];
    if (handler) {
      handler(event.data.detail ?? {});
    }
  });

  Object.entries(eventHandlers).forEach(([eventName, handler]) => {
    window.addEventListener(eventName, event => handler(event.detail ?? {}));
  });
}

/* Map of language display names to file extensions (superset for all platforms) */
const codehub_LANGUAGES = {
  C: '.c',
  'C++': '.cpp',
  'C#': '.cs',
  Bash: '.sh',
  Cangjie: '.cj',
  Dart: '.dart',
  Elixir: '.ex',
  Erlang: '.erl',
  Go: '.go',
  Java: '.java',
  JavaScript: '.js',
  Javascript: '.js',
  Kotlin: '.kt',
  MySQL: '.sql',
  'MS SQL Server': '.sql',
  Oracle: '.sql',
  PHP: '.php',
  Pandas: '.py',
  PostgreSQL: '.sql',
  Python: '.py',
  Python3: '.py',
  Racket: '.rkt',
  Ruby: '.rb',
  Rust: '.rs',
  Scala: '.scala',
  Swift: '.swift',
  TypeScript: '.ts',
};

/* returns today's date in MM-DD-YYYY format */
function codehubGetTodaysDate() {
  const today = new Date();
  const month = today.getMonth() + 1; // months are zero-indexed
  const day = today.getDate();
  const year = today.getFullYear();
  const formattedMonth = month < 10 ? '0' + month : month;
  const formattedDay = day < 10 ? '0' + day : day;
  return `${formattedMonth}-${formattedDay}-${year}`;
}

/* returns the current time in hh-mm-ss format */
function codehubGetTime() {
  const today = new Date();
  const hours = today.getHours();
  const minutes = today.getMinutes();
  const seconds = today.getSeconds();
  const formattedHours = hours < 10 ? '0' + hours : hours;
  const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  const formattedSeconds = seconds < 10 ? '0' + seconds : seconds;
  return `${formattedHours}-${formattedMinutes}-${formattedSeconds}`;
}

/* Replaces {placeholder} tokens in a commit-message template with values from context. */
function codehubParseCommitTemplate(text, problemContext) {
  return text.replace(/{(\w+)}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(problemContext, key) ? problemContext[key] : match,
  );
}

/**
 * Reads the user's custom commit-message template (if any) from storage and
 * resolves it against the problem context. Returns null when no template is set
 * so the caller can fall back to the default stats-based commit message.
 */
async function codehubGetCustomCommitMessage(problemContext) {
  const { custom_commit_message } = await chrome.storage.local.get('custom_commit_message');
  if (!custom_commit_message || !custom_commit_message.trim()) return null;
  return codehubParseCommitTemplate(custom_commit_message, problemContext);
}

/**
 * Increments the global solved/difficulty counters in the shared stats object.
 * Works alongside LeetCode's counters so the popup reflects all platforms.
 *
 * @param {string} difficulty - "Easy" | "Medium" | "Hard" | ""
 */
async function codehubIncrementStats(difficulty) {
  const { stats } = await chrome.storage.local.get('stats');
  const safeStats = stats || { solved: 0, easy: 0, medium: 0, hard: 0, shas: {} };
  safeStats.solved = (safeStats.solved || 0) + 1;
  if (difficulty === 'Easy') safeStats.easy = (safeStats.easy || 0) + 1;
  if (difficulty === 'Medium') safeStats.medium = (safeStats.medium || 0) + 1;
  if (difficulty === 'Hard') safeStats.hard = (safeStats.hard || 0) + 1;
  await chrome.storage.local.set({ stats: safeStats });
}

/**
 * Returns true if a solution file for this problem was already uploaded.
 * Used to avoid double-counting the same problem in the stats.
 */
async function codehubAlreadyCompleted(storageKey) {
  const { stats } = await chrome.storage.local.get('stats');
  return Boolean(stats?.shas?.[storageKey]);
}

/**
 * Constructs the full GitHub API URL for a file inside a platform folder.
 *
 * Folder layout mirrors LeetCode's options:
 *   - default:                         {platform}/{problem}/{file}
 *   - useDifficultyFolder:             {platform}/{difficulty}/{problem}/{file}
 *   - useLanguageFolder:               {platform}/{language}/{problem}/{file}
 *   - both:                            {platform}/{language}/{difficulty}/{problem}/{file}
 *
 * @param {string} hook - GitHub repo in "username/repo" format.
 * @param {string} platformFolder - e.g. "LeetCode", "HackerRank", "GeeksForGeeks", "Code360"
 * @param {string} difficulty - "Easy" | "Medium" | "Hard" | "" (empty = no subfolder)
 * @param {string} problem - problem slug folder name
 * @param {string} filename - file name to upload
 * @param {boolean} useDifficultyFolder - whether to include difficulty as a subfolder
 * @param {boolean} [useLanguageFolder=false] - whether to include language as a subfolder
 * @param {string} [language=''] - language display name (used when useLanguageFolder is true)
 * @returns {string} Full GitHub API URL
 */
function buildGitHubUrl(
  hook,
  platformFolder,
  difficulty,
  problem,
  filename,
  useDifficultyFolder,
  useLanguageFolder = false,
  language = '',
) {
  const filePath = problem ? `${problem}/${filename}` : filename;
  if (!problem) {
    return `https://api.github.com/repos/${hook}/contents/${filePath}`;
  }

  const segments = [platformFolder];
  if (useLanguageFolder && language) segments.push(language);
  if (useDifficultyFolder && difficulty) segments.push(difficulty);
  segments.push(filePath);

  return `https://api.github.com/repos/${hook}/contents/${segments.join('/')}`;
}

/**
 * Uploads or updates a single file to GitHub.
 *
 * @param {string} token - GitHub personal access token
 * @param {string} hook - "username/repo"
 * @param {string} code - base64-encoded file content
 * @param {string} platformFolder - platform folder name
 * @param {string} difficulty - difficulty string (used when useDifficultyFolder is true)
 * @param {string} problem - problem slug folder name
 * @param {string} filename - file name
 * @param {string|null} sha - existing file SHA (empty string or null for new file)
 * @param {string} commitMsg - commit message
 * @param {boolean} useDifficultyFolder
 * @returns {Promise<object>} GitHub API response body
 */
async function githubUpload(
  token,
  hook,
  code,
  platformFolder,
  difficulty,
  problem,
  filename,
  sha,
  commitMsg,
  useDifficultyFolder,
  useLanguageFolder = false,
  language = '',
) {
  const url = buildGitHubUrl(
    hook,
    platformFolder,
    difficulty,
    problem,
    filename,
    useDifficultyFolder,
    useLanguageFolder,
    language,
  );

  const body = JSON.stringify({
    message: commitMsg,
    content: code,
    ...(sha ? { sha } : {}),
  });

  const res = await codehubGithubFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    body,
  });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(res.status.toString());
  }

  const responseBody = res.json;
  const updatedSha = responseBody.content.sha;

  // Persist the new SHA in local storage so future uploads can update rather than re-create
  const { stats } = await chrome.storage.local.get('stats');
  const safeStats = stats || { solved: 0, easy: 0, medium: 0, hard: 0, shas: {} };
  const key = `${platformFolder}/${problem}`;
  if (!safeStats.shas[key]) safeStats.shas[key] = {};
  safeStats.shas[key][filename] = updatedSha;
  await chrome.storage.local.set({ stats: safeStats });

  console.log(`[CodeHub] Committed ${filename} → ${platformFolder}/${problem}`);
  return responseBody;
}

/**
 * Creates a directory placeholder on GitHub by uploading a .gitkeep file.
 * GitHub doesn't have a dedicated directory creation API, so we upload
 * a .gitkeep file to the desired path to initialize the directory.
 *
 * @param {string} token - GitHub personal access token
 * @param {string} hook - "username/repo"
 * @param {string} path - directory path relative to repo root, e.g. "HackerRank" or "LeetCode/Easy"
 * @returns {Promise<void>}
 */
async function createGitDirectory(token, hook, path) {
  const url = `https://api.github.com/repos/${hook}/contents/${path}/.gitkeep`;
  const body = JSON.stringify({
    message: `Create ${path} directory`,
    content: btoa(unescape(encodeURIComponent(''))),
  });

  const res = await codehubGithubFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    body,
  });

  if (res.status === 201 || res.status === 200) {
    console.log(`[CodeHub] Created directory: ${path}`);
  } else if (res.status === 422) {
    console.log(`[CodeHub] Directory already exists: ${path}`);
  } else {
    const text = res.text || '';
    throw new Error(`Failed to create directory "${path}": ${res.status} ${text}`);
  }
}

/**
 * Ensures a directory exists on the remote repository.
 * Uses the GitHub API to check whether the platform folder exists; if it does
 * not, the directory is created by uploading a .gitkeep placeholder.
 *
 * @param {string} token - GitHub personal access token
 * @param {string} hook - "username/repo"
 * @param {string} platformFolder - platform folder name, e.g. "HackerRank"
 * @param {string} difficulty - optional difficulty subfolder ("Easy" | "Medium" | "Hard")
 * @param {string} [language=''] - optional language subfolder (when useLanguageFolder is on)
 * @param {boolean} [useLanguageFolder=false]
 * @returns {Promise<void>}
 */
async function ensureGitDirectory(
  token,
  hook,
  platformFolder,
  difficulty = '',
  language = '',
  useLanguageFolder = false,
) {
  const segments = [platformFolder];
  if (useLanguageFolder && language) segments.push(language);
  if (difficulty) segments.push(difficulty);
  const dirPath = segments.join('/');
  const checkUrl = `https://api.github.com/repos/${hook}/contents/${dirPath}`;

  const checkRes = await codehubGithubFetch(checkUrl, {
    method: 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (checkRes.status === 404) {
    await createGitDirectory(token, hook, dirPath);
  } else if (!checkRes.ok) {
    const text = checkRes.text || '';
    throw new Error(`Failed to check directory "${dirPath}": ${checkRes.status} ${text}`);
  }
}

window.codehub_LANGUAGES = codehub_LANGUAGES;
window.codehubPushSolution = codehubPushSolution;
window.ensureGitDirectory = ensureGitDirectory;
window.codehubGithubFetch = codehubGithubFetch;
window.codehubGithubJson = codehubGithubJson;
window.listenCodeHubEvents = listenCodeHubEvents;
window.codehubExtractCodeFromDom = codehubExtractCodeFromDom;

/**
 * Extracts editor code purely from the DOM — no reliance on page-context
 * globals like `window.monaco` or `window.ace`, which are NOT visible from the
 * isolated content-script world that all platform scripts run in.
 *
 * Strategy order (every branch is DOM-only):
 *  1. Monaco `._domElement` instance bound on the container element
 *  2. CodeMirror instance bound on `.CodeMirror` element
 *  3. Ace editor instance bound on `.ace_editor` element
 *  4. Monaco "Minimised DOM" — scrape `.view-lines .view-line` text nodes
 *  5. Ace "Minimised DOM" — scrape `.ace_line` / `.ace_content` text nodes
 *  6. `textarea` values (Monaco/CodeMirror mirror textarea)
 *
 * Works for GeeksForGeeks, Code360, and HackerRank editors.
 *
 * @param {Document|ShadowRoot} [root=document]
 * @returns {string|null} the editor code, or null when nothing was found
 */
function codehubExtractCodeFromDom(root = document) {
  // 1. Monaco via the instance attached to its container DOM element
  try {
    const monacoContainers = root.querySelectorAll('.monaco-editor, [data-monaco]');
    for (const container of monacoContainers) {
      // Monaco attaches the editor instance under various keys
      const instanceKeys = ['_editor', 'editor', 'codeEditor', 'model'];
      for (const key of instanceKeys) {
        const inst = container[key];
        if (inst && typeof inst.getValue === 'function') {
          const val = inst.getValue();
          if (val && val.trim().length > 2) return val;
        }
      }
      // The model is sometimes reachable via a nested textarea's dataset
      const ta = container.querySelector('textarea.inputarea, textarea');
      if (ta && ta.value && ta.value.trim().length > 2) return ta.value;
    }
  } catch {
    // ignore
  }

  // 2. CodeMirror instance bound on the element
  try {
    const cmEls = root.querySelectorAll('.CodeMirror');
    for (const cm of cmEls) {
      if (cm.CodeMirror && typeof cm.CodeMirror.getValue === 'function') {
        const val = cm.CodeMirror.getValue();
        if (val && val.trim().length > 2) return val;
      }
    }
  } catch {
    // ignore
  }

  // 3. Ace editor instance bound on the element
  try {
    const aceEls = root.querySelectorAll('.ace_editor');
    for (const aceEl of aceEls) {
      // The Ace env/editor is sometimes attached to its container element
      const env = aceEl.env;
      if (env && env.editor && typeof env.editor.getValue === 'function') {
        const val = env.editor.getValue();
        if (val && val.trim().length > 2) return val;
      }
    }
  } catch {
    // ignore
  }

  // 4. Monaco "Minimised DOM" scraping — the rendered lines
  try {
    const viewLines = root.querySelector('.monaco-editor .view-lines, .view-lines');
    if (viewLines) {
      const lines = viewLines.querySelectorAll('.view-line');
      if (lines.length > 0) {
        const code = Array.from(lines)
          .map(line => line.textContent || '')
          .join('\n');
        if (code.trim().length > 2) return code;
      }
    }
  } catch {
    // ignore
  }

  // 5. Ace "Minimised DOM" scraping
  try {
    const aceContent = root.querySelector('.ace_content, .ace_text-layer');
    if (aceContent) {
      const lines = aceContent.querySelectorAll('.ace_line');
      if (lines.length > 0) {
        const code = Array.from(lines)
          .map(line => line.textContent || '')
          .join('\n');
        if (code.trim().length > 2) return code;
      }
    }
  } catch {
    // ignore
  }

  // 6. Generic textarea fallbacks
  try {
    const textareas = root.querySelectorAll(
      'textarea[class*="editor"], textarea[class*="code"], textarea.inputarea, textarea',
    );
    for (const ta of textareas) {
      const val = ta.value || ta.textContent || '';
      if (val.trim().length > 2) return val;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Fetches the current SHA and content of a file on GitHub (needed for updates).
 *
 * @param {string} token
 * @param {string} hook
 * @param {string} platformFolder
 * @param {string} difficulty
 * @param {string} problem
 * @param {string} filename
 * @param {boolean} useDifficultyFolder
 * @returns {Promise<{sha: string, content: string}|null>}
 */
async function githubGetFile(
  token,
  hook,
  platformFolder,
  difficulty,
  problem,
  filename,
  useDifficultyFolder,
  useLanguageFolder = false,
  language = '',
) {
  const url = buildGitHubUrl(
    hook,
    platformFolder,
    difficulty,
    problem,
    filename,
    useDifficultyFolder,
    useLanguageFolder,
    language,
  );

  const res = await codehubGithubFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.status.toString());
  return res.json;
}

/**
 * High-level function to push a solution file (and optionally a README) to GitHub.
 *
 * Mirrors LeetCode's behaviour so every platform enjoys the same features:
 *   - difficulty / language subfolders (useDifficultyFolder / useLanguageFolder)
 *   - timestamped filenames (useTimestampFilename)
 *   - custom commit-message templates ({time} {space} {language} {problemName}
 *     {difficulty} {date} {problemTopic})
 *   - global solved/difficulty stats (shown in the popup)
 *   - duplicate-completion detection (so re-solves don't inflate stats)
 *
 * Reads codehub_token, codehub_hook and the feature toggles from chrome.storage.local.
 *
 * @param {object} params
 * @param {string} params.platformFolder - "LeetCode" | "HackerRank" | "GeeksForGeeks" | "Code360"
 * @param {string} params.problemName - slug, e.g. "reverse-a-linked-list"
 * @param {string} params.difficulty - "Easy" | "Medium" | "Hard"
 * @param {string} params.code - raw solution code (plain string)
 * @param {string} params.language - language display name, e.g. "Python3"
 * @param {string} [params.commitMsg] - optional commit message (overridden by a custom template)
 * @param {string|null} [params.readmeContent] - HTML/markdown problem statement (or null to skip)
 * @param {string|null} [params.filenameSuffix] - optional filename suffix (e.g. "-bfs")
 * @param {string} [params.time] - runtime for the commit template (e.g. "120 ms")
 * @param {string} [params.space] - memory for the commit template (e.g. "42 MB")
 * @param {string} [params.timePercentile] - runtime percentile
 * @param {string} [params.spacePercentile] - memory percentile
 * @param {string} [params.problemTopic] - primary topic tag for the commit template
 * @returns {Promise<boolean>} resolves to true when a NEW problem was committed
 */
async function codehubPushSolution({
  platformFolder,
  problemName,
  difficulty,
  code,
  language,
  commitMsg,
  readmeContent = null,
  filenameSuffix = null,
  time = '',
  space = '',
  timePercentile = '',
  spacePercentile = '',
  problemTopic = 'UNKNOWN',
}) {
  const { codehub_token } = await chrome.storage.local.get('codehub_token');
  if (!codehub_token) throw new Error('[CodeHub] No GitHub token configured.');

  const { mode_type } = await chrome.storage.local.get('mode_type');
  if (mode_type !== 'commit') throw new Error('[CodeHub] Extension not in commit mode.');

  const { codehub_hook } = await chrome.storage.local.get('codehub_hook');
  if (!codehub_hook) throw new Error('[CodeHub] No GitHub repo configured.');

  // Feature toggles (shared with LeetCode)
  const { useDifficultyFolder = false } = await chrome.storage.local.get('useDifficultyFolder');
  const { useLanguageFolder = false } = await chrome.storage.local.get('useLanguageFolder');
  const { useTimestampFilename = false } = await chrome.storage.local.get('useTimestampFilename');

  const ext = codehub_LANGUAGES[language] || '.txt';

  // Resolve the final filename, honouring timestamped-versioning and suffixes
  let baseFilename;
  if (useTimestampFilename) {
    const timestamp = `${codehubGetTodaysDate()}-${codehubGetTime()}`.replace(/[:\s]/g, '--');
    baseFilename = filenameSuffix
      ? `${problemName}${filenameSuffix}-${timestamp}${ext}`
      : `${problemName}-${timestamp}${ext}`;
  } else {
    baseFilename = filenameSuffix
      ? `${problemName}${filenameSuffix}${ext}`
      : `${problemName}${ext}`;
  }

  const { stats } = await chrome.storage.local.get('stats');
  const safeStats = stats || { solved: 0, easy: 0, medium: 0, hard: 0, shas: {} };
  const storageKey = `${platformFolder}/${problemName}`;
  const existingSha = safeStats.shas?.[storageKey]?.[baseFilename] ?? null;

  // Was this problem already solved on a previous run? (captured BEFORE uploading)
  const alreadyCompleted = await codehubAlreadyCompleted(storageKey);

  // Resolve the commit message: custom template > caller-provided > stats-based default
  const problemContext = {
    time: time ? `${time} (${timePercentile}%)` : 'N/A',
    space: space ? `${space} (${spacePercentile}%)` : 'N/A',
    language: language || 'Unknown',
    problemName,
    difficulty: difficulty || 'Unknown',
    date: codehubGetTodaysDate(),
    problemTopic,
  };
  const defaultStatsCommit = `Time: ${problemContext.time}, Space: ${problemContext.space} - CodeHub`;
  const customCommit = await codehubGetCustomCommitMessage(problemContext);
  const finalCommitMsg = customCommit || commitMsg || defaultStatsCommit;

  // Guard: prevent duplicate concurrent uploads for the same problem
  if (codehubPushSolution._inProgress?.has(storageKey)) {
    console.log(`[CodeHub] Already uploading ${storageKey}, skipping duplicate.`);
    return false;
  }
  codehubPushSolution._inProgress = codehubPushSolution._inProgress || new Set();
  codehubPushSolution._inProgress.add(storageKey);

  try {
    const encodedCode = btoa(unescape(encodeURIComponent(code)));

    // Ensure the platform (and optional language/difficulty) directory exists on GitHub
    await ensureGitDirectory(
      codehub_token,
      codehub_hook,
      platformFolder,
      useDifficultyFolder ? difficulty : '',
      language,
      useLanguageFolder,
    );

    // Handle 409 conflict by fetching latest SHA and retrying
    async function uploadWithRetry(sha) {
      try {
        return await githubUpload(
          codehub_token,
          codehub_hook,
          encodedCode,
          platformFolder,
          difficulty,
          problemName,
          baseFilename,
          sha,
          finalCommitMsg,
          useDifficultyFolder,
          useLanguageFolder,
          language,
        );
      } catch (err) {
        if (err.message === '409') {
          const latest = await githubGetFile(
            codehub_token,
            codehub_hook,
            platformFolder,
            difficulty,
            problemName,
            baseFilename,
            useDifficultyFolder,
            useLanguageFolder,
            language,
          );
          return githubUpload(
            codehub_token,
            codehub_hook,
            encodedCode,
            platformFolder,
            difficulty,
            problemName,
            baseFilename,
            latest?.sha ?? null,
            finalCommitMsg,
            useDifficultyFolder,
            useLanguageFolder,
            language,
          );
        }
        throw err;
      }
    }

    const uploads = [uploadWithRetry(existingSha ?? null)];

    // Upload README if provided and not already uploaded
    if (readmeContent && !safeStats.shas?.[storageKey]?.['README.md']) {
      const encodedReadme = btoa(unescape(encodeURIComponent(readmeContent)));
      uploads.push(
        githubUpload(
          codehub_token,
          codehub_hook,
          encodedReadme,
          platformFolder,
          difficulty,
          problemName,
          'README.md',
          null,
          `Create README: ${problemName}`,
          useDifficultyFolder,
          useLanguageFolder,
          language,
        ),
      );
    }

    await Promise.all(uploads);

    // Only count newly solved problems toward the stats
    if (!alreadyCompleted) {
      await codehubIncrementStats(difficulty);
      console.log(`[CodeHub] Stats incremented for ${storageKey}`);
    }
    return !alreadyCompleted;
  } catch (err) {
    console.error(`[CodeHub] Upload failed for ${storageKey}:`, err.message || err);
    throw err;
  } finally {
    codehubPushSolution._inProgress?.delete(storageKey);
  }
}
