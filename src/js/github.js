/**
 * Shared GitHub upload utilities for CodeHub multi-platform support.
 * Loaded before all platform-specific content scripts.
 *
 * Functions are exposed as globals (window.*) so they are accessible
 * from leetcode.js, hackerrank.js, geeksforgeeks.js, and codingninja.js.
 */

const CODEHUB_MESSAGE_SOURCE = 'codehub-extension';

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
const LEETHUB_LANGUAGES = {
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

/**
 * Constructs the full GitHub API URL for a file inside a platform folder.
 *
 * @param {string} hook - GitHub repo in "username/repo" format.
 * @param {string} platformFolder - e.g. "LeetCode", "HackerRank", "GeeksForGeeks", "Code360"
 * @param {string} difficulty - "Easy" | "Medium" | "Hard" | "" (empty = no subfolder)
 * @param {string} problem - problem slug folder name
 * @param {string} filename - file name to upload
 * @param {boolean} useDifficultyFolder - whether to include difficulty as a subfolder
 * @returns {string} Full GitHub API URL
 */
function buildGitHubUrl(hook, platformFolder, difficulty, problem, filename, useDifficultyFolder) {
  const filePath = problem ? `${problem}/${filename}` : filename;
  if (!problem) {
    return `https://api.github.com/repos/${hook}/contents/${filePath}`;
  }
  const path = useDifficultyFolder
    ? `${platformFolder}/${difficulty}/${filePath}`
    : `${platformFolder}/${filePath}`;
  return `https://api.github.com/repos/${hook}/contents/${path}`;
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
) {
  const url = buildGitHubUrl(
    hook,
    platformFolder,
    difficulty,
    problem,
    filename,
    useDifficultyFolder,
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
 * @returns {Promise<void>}
 */
async function ensureGitDirectory(token, hook, platformFolder, difficulty = '') {
  const segments = [platformFolder];
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

window.LEETHUB_LANGUAGES = LEETHUB_LANGUAGES;
window.leethubPushSolution = leethubPushSolution;
window.ensureGitDirectory = ensureGitDirectory;
window.codehubGithubFetch = codehubGithubFetch;
window.codehubGithubJson = codehubGithubJson;
window.listenCodeHubEvents = listenCodeHubEvents;

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
) {
  const url = buildGitHubUrl(
    hook,
    platformFolder,
    difficulty,
    problem,
    filename,
    useDifficultyFolder,
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
 * Reads leethub_token, leethub_hook, useDifficultyFolder from chrome.storage.local.
 *
 * @param {object} params
 * @param {string} params.platformFolder - "LeetCode" | "HackerRank" | "GeeksForGeeks" | "Code360"
 * @param {string} params.problemName - slug, e.g. "reverse-a-linked-list"
 * @param {string} params.difficulty - "Easy" | "Medium" | "Hard"
 * @param {string} params.code - raw solution code (plain string)
 * @param {string} params.language - language display name, e.g. "Python3"
 * @param {string} params.commitMsg - commit message
 * @param {string|null} [params.readmeContent] - HTML/markdown problem statement (or null to skip)
 * @param {string|null} [params.filenameSuffix] - optional filename suffix (e.g. "-bfs")
 */
async function leethubPushSolution({
  platformFolder,
  problemName,
  difficulty,
  code,
  language,
  commitMsg,
  readmeContent = null,
  filenameSuffix = null,
}) {
  const { leethub_token } = await chrome.storage.local.get('leethub_token');
  if (!leethub_token) throw new Error('[CodeHub] No GitHub token configured.');

  const { mode_type } = await chrome.storage.local.get('mode_type');
  if (mode_type !== 'commit') throw new Error('[CodeHub] Extension not in commit mode.');

  const { leethub_hook } = await chrome.storage.local.get('leethub_hook');
  if (!leethub_hook) throw new Error('[CodeHub] No GitHub repo configured.');

  const { useDifficultyFolder = false } = await chrome.storage.local.get('useDifficultyFolder');

  const ext = LEETHUB_LANGUAGES[language] || '.txt';
  const baseFilename = filenameSuffix
    ? `${problemName}${filenameSuffix}${ext}`
    : `${problemName}${ext}`;

  const { stats } = await chrome.storage.local.get('stats');
  const safeStats = stats || { solved: 0, easy: 0, medium: 0, hard: 0, shas: {} };
  const storageKey = `${platformFolder}/${problemName}`;
  const existingSha = safeStats.shas?.[storageKey]?.[baseFilename] ?? null;

  // Guard: prevent duplicate concurrent uploads for the same problem
  if (leethubPushSolution._inProgress?.has(storageKey)) {
    console.log(`[CodeHub] Already uploading ${storageKey}, skipping duplicate.`);
    return;
  }
  leethubPushSolution._inProgress = leethubPushSolution._inProgress || new Set();
  leethubPushSolution._inProgress.add(storageKey);

  try {
    const encodedCode = btoa(unescape(encodeURIComponent(code)));

    // Ensure the platform (and optional difficulty) directory exists on GitHub
    await ensureGitDirectory(
      leethub_token,
      leethub_hook,
      platformFolder,
      useDifficultyFolder ? difficulty : '',
    );

    // Handle 409 conflict by fetching latest SHA and retrying
    async function uploadWithRetry(sha) {
      try {
        return await githubUpload(
          leethub_token,
          leethub_hook,
          encodedCode,
          platformFolder,
          difficulty,
          problemName,
          baseFilename,
          sha,
          commitMsg,
          useDifficultyFolder,
        );
      } catch (err) {
        if (err.message === '409') {
          const latest = await githubGetFile(
            leethub_token,
            leethub_hook,
            platformFolder,
            difficulty,
            problemName,
            baseFilename,
            useDifficultyFolder,
          );
          return githubUpload(
            leethub_token,
            leethub_hook,
            encodedCode,
            platformFolder,
            difficulty,
            problemName,
            baseFilename,
            latest?.sha ?? null,
            commitMsg,
            useDifficultyFolder,
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
          leethub_token,
          leethub_hook,
          encodedReadme,
          platformFolder,
          difficulty,
          problemName,
          'README.md',
          null,
          `Create README: ${problemName}`,
          useDifficultyFolder,
        ),
      );
    }

    await Promise.all(uploads);
  } catch (err) {
    console.error(`[CodeHub] Upload failed for ${storageKey}:`, err.message || err);
    throw err;
  } finally {
    leethubPushSolution._inProgress?.delete(storageKey);
  }
}
