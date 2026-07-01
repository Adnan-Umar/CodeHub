/* global codehubPushSolution */

const CODE360_PLATFORM_FOLDER = 'Code360';

function getCode360ProblemSlug() {
  const path = window.location.pathname;
  const match = path.match(/\/problems\/([^/?#]+)/);
  if (match) return match[1];

  const title = document.title?.split('|')[0]?.trim();
  return title ? title.toLowerCase().replace(/\s+/g, '-') : null;
}

function getCode360Code() {
  // Try 1: Monaco editor via getModels()
  if (window.monaco && window.monaco.editor) {
    try {
      const models = window.monaco.editor.getModels();
      if (models && models.length > 0) {
        return models[0].getValue();
      }
    } catch {
      // ignore
    }

    // Try 2: Monaco editor via getEditors()
    try {
      const editors = window.monaco.editor.getEditors?.() || [];
      if (editors.length > 0) {
        return editors[0].getValue();
      }
    } catch {
      // ignore
    }
  }

  // Try 3: CodeMirror
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.CodeMirror) {
    return cm.CodeMirror.getValue();
  }

  // Try 4: Hidden textarea
  const editorTextarea = document.querySelector(
    'textarea[class*="editor"], textarea[class*="code"]',
  );
  if (editorTextarea) {
    return editorTextarea.value || editorTextarea.textContent;
  }

  // Try 5: Any textarea
  const textarea = document.querySelector('textarea');
  if (textarea) {
    return textarea.value;
  }

  return null;
}

/**
 * Retries code extraction multiple times with a delay, mirroring HackerRank's
 * approach. Code360's Monaco editor may not be ready immediately after submission.
 *
 * NOTE: Content scripts run in the isolated world, so `window.monaco` checks
 * inside getCode360Code() are mostly no-ops here. The shared DOM scraper
 * (codehubExtractCodeFromDom) is therefore tried first because it reads the
 * rendered lines directly and works reliably cross-world.
 */
async function getCode360CodeWithRetry(attempts = 8, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    // 1. World-agnostic DOM scraper (works from isolated content-script world)
    let code = window.codehubExtractCodeFromDom?.(document) || null;
    // 2. Legacy extraction (Monaco via page globals + textareas)
    if (!code) code = getCode360Code();
    if (code && code.trim().length > 2) {
      return code;
    }
    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

function getCode360Language() {
  const selectors = [
    '.selected-language',
    '[data-testid*="language"]',
    '[class*="language"] button',
    '[class*="language"] span',
  ];

  for (const selector of selectors) {
    const elem = document.querySelector(selector);
    if (elem?.innerText?.trim()) {
      return elem.innerText.trim();
    }
  }

  return null;
}

function getCode360Difficulty() {
  const text = document.body?.innerText || '';
  if (text.toLowerCase().includes('easy')) return 'Easy';
  if (text.toLowerCase().includes('medium')) return 'Medium';
  if (text.toLowerCase().includes('hard')) return 'Hard';
  return '';
}

/**
 * Scrapes runtime / memory from the Code360 results DOM so the shared commit
 * template can surface them (mirrors LeetCode's behaviour).
 */
function getCode360SubmissionStats() {
  const stats = { time: '', space: '' };
  try {
    const allElements = document.querySelectorAll(
      '[class*="time"], [class*="memory"], [class*="result"], [class*="verdict"]',
    );
    for (const el of allElements) {
      const text = (el.innerText || '').toLowerCase();
      if (!stats.time && (text.includes('time') || text.includes('sec'))) {
        stats.time = (el.innerText || '').trim();
      }
      if (!stats.space && (text.includes('memory') || text.includes('space'))) {
        stats.space = (el.innerText || '').trim();
      }
      if (stats.time && stats.space) break;
    }
  } catch {
    // selectors are best-effort
  }
  return stats;
}

/**
 * Returns the problem title (used for the README header), preferring the page
 * title with the trailing platform suffix stripped.
 */
function getCode360ProblemTitle() {
  return document.title?.split('|')[0]?.trim() || '';
}

let code360SpinnerElem = null;

function code360ShowSpinner() {
  const style = document.createElement('style');
  style.textContent = `.codehub-code360-spinner{display:inline-block;width:1.4em;height:1.4em;border:0.3em solid transparent;border-color:#eee;border-top-color:#4F46E5;border-radius:50%;animation:codehub-code360-spin 1s linear infinite;margin-left:8px;vertical-align:middle;} @keyframes codehub-code360-spin{100%{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  code360SpinnerElem = document.createElement('span');
  code360SpinnerElem.className = 'codehub-code360-spinner';
  code360SpinnerElem.id = 'codehub-code360-indicator';

  let target = document.querySelector(
    'button[type="submit"], [data-testid*="submit"], .submit-btn, [class*="submit-button"]',
  );
  // Fallback: find button containing "submit" or "run" text
  if (!target) {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text =
        btn.innerText?.trim().toLowerCase() || btn.textContent?.trim().toLowerCase() || '';
      if (text.includes('submit') || text.includes('run code')) {
        target = btn;
        break;
      }
    }
  }
  // Fallback: fixed overlay
  if (!target) {
    code360SpinnerElem.style.position = 'fixed';
    code360SpinnerElem.style.top = '16px';
    code360SpinnerElem.style.right = '16px';
    code360SpinnerElem.style.zIndex = '99999';
    document.body.appendChild(code360SpinnerElem);
  } else if (target.parentElement) {
    target.parentElement.appendChild(code360SpinnerElem);
  }
}

function code360MarkSuccess() {
  if (code360SpinnerElem) {
    code360SpinnerElem.className = '';
    code360SpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid #78b13f;border-right:5px solid #78b13f;margin-left:8px;vertical-align:middle;';
  }
}

function code360MarkFailed() {
  if (code360SpinnerElem) {
    code360SpinnerElem.className = '';
    code360SpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid red;border-right:5px solid red;margin-left:8px;vertical-align:middle;';
  }
}

async function handleCode360Submission(detail) {
  console.log(`[CodeHub Code360] Submission event received:`, detail);

  const problemSlug = detail?.problemSlug || getCode360ProblemSlug();

  const status =
    `${detail?.status || detail?.verdict || detail?.response?.status || ''}`.toLowerCase();
  const isAccepted = status === 'ac' || status.includes('accepted');

  if (!isAccepted) {
    console.log(`[CodeHub Code360] Submission not accepted, skipping upload. Status:`, status);
    code360MarkFailed();
    return;
  }

  if (!problemSlug) {
    console.error(`[CodeHub Code360] Could not determine problem slug.`);
    code360MarkFailed();
    return;
  }

  code360ShowSpinner();

  try {
    const code = detail?.code || (await getCode360CodeWithRetry());
    if (!code) throw new Error('Could not extract solution code.');

    const language = detail?.language || getCode360Language() || 'text';
    const difficulty = detail?.difficulty || getCode360Difficulty() || '';
    const { time, space } = getCode360SubmissionStats();
    const title = getCode360ProblemTitle() || problemSlug;

    const problemUrl = window.location.href.split('?')[0];
    const difficultyLine = difficulty ? `\n**Difficulty**: ${difficulty}` : '';
    const readmeContent = `## [${title}](${problemUrl})${difficultyLine}\n\n*Platform: Code360*\n`;

    console.log(`[CodeHub Code360] Uploading ${problemSlug}...`);
    await codehubPushSolution({
      platformFolder: CODE360_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      readmeContent,
      filenameSuffix: detail?.suffix || null,
      time,
      space,
    });

    code360MarkSuccess();
    console.log(`[CodeHub Code360] Successfully pushed ${problemSlug}`);
  } catch (err) {
    code360MarkFailed();
    console.error(`[CodeHub Code360] Upload failed:`, err.message || err);
  }
}

window.listenCodeHubEvents({
  codingNinjasSubmission: detail => handleCode360Submission(detail),
});

function scanCode360Result() {
  const host = window.location.hostname;
  if (!host.includes('codingninjas.com') && !host.includes('naukri.com')) return false;
  const allElements = document.querySelectorAll('body *');
  for (const el of allElements) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (
      (text.includes('accepted') ||
        text.includes('congratulations') ||
        text === 'ac' ||
        text === 'done') &&
      el.children.length === 0 &&
      text.length < 50 &&
      !el.dataset.codehubProcessed
    ) {
      el.dataset.codehubProcessed = 'true';
      code360ShowSpinner();
      handleCode360Submission({ status: text.includes('congratulations') ? 'Accepted' : text });
      return true;
    }
  }
  return false;
}

const code360Observer = new MutationObserver(() => {
  scanCode360Result();
});

// Also poll periodically as a fallback
let code360PollCount = 0;
const code360PollInterval = setInterval(() => {
  if (code360PollCount++ > 30) {
    clearInterval(code360PollInterval);
    return;
  }
  const host = window.location.hostname;
  if (!host.includes('codingninjas.com') && !host.includes('naukri.com')) {
    return;
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scanCode360Result();
  }
}, 2000);

setTimeout(() => {
  if (document.body) {
    code360Observer.observe(document.body, { childList: true, subtree: true });
  }
  // Initial scan
  scanCode360Result();
}, 1500);

console.log('[CodeHub] Code360 content script loaded.');

// ====== Manual Push Button (Code360) ======

function code360GetGitIcon() {
  const gitSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  gitSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  gitSvg.setAttribute('width', '18');
  gitSvg.setAttribute('height', '18');
  gitSvg.setAttribute('viewBox', '0 0 114.8625 114.8625');
  const gitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  gitPath.setAttribute('fill', '#100f0d');
  gitPath.setAttribute(
    'd',
    'm112.693375 52.3185-50.149-50.146875c-2.886625-2.88875-7.57075-2.88875-10.461375 0l-10.412625 10.4145 13.2095 13.2095C57.94975 24.759 61.47025 25.45475 63.9165 27.9015c2.461 2.462 3.150875 6.01275 2.087375 9.09375l12.732 12.7305c3.081-1.062 6.63325-.3755 9.09425 2.088875 3.4375 3.4365 3.4375 9.007375 0 12.44675-3.44 3.4395-9.00975 3.4395-12.45125 0-2.585375-2.587875-3.225125-6.387125-1.914-9.57275l-11.875-11.874V74.06075c.837375.415 1.628375.96775 2.326625 1.664 3.4375 3.437125 3.4375 9.007375 0 12.44975-3.4375 3.436-9.01125 3.436-12.44625 0-3.4375-3.442375-3.4375-9.012625 0-12.44975.849625-.848625 1.8335-1.490625 2.88325-1.920375V42.26925c-1.04975-.42975-2.03125-1.066375-2.88325-1.920875-2.6035-2.602625-3.23-6.424375-1.894625-9.622125L36.55325 17.701875 2.1660125 52.086125c-2.88818 2.891125-2.88818 7.57525 0 10.463875l50.1513625 50.146975c2.88725 2.88818125 7.569875 2.88818125 10.461375 0l49.914625-49.9146c2.889625-2.889125 2.889625-7.575625 0-10.463875',
  );
  gitSvg.appendChild(gitPath);
  return gitSvg;
}

function code360AddManualPushButton() {
  const host = window.location.hostname;
  if (!host.includes('codingninjas.com') && !host.includes('naukri.com')) return;
  if (document.getElementById('code360ManualGitSubmit')) return;

  const submitBtn = document.querySelector(
    'button[type="submit"], [data-testid*="submit"], .submit-btn, [class*="submit-button"], button[class*="run"]',
  );
  if (!submitBtn) return;

  const btn = document.createElement('button');
  btn.id = 'code360ManualGitSubmit';
  btn.className =
    'px-3 py-2 rounded font-medium text-sm flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700';
  btn.textContent = 'Push ';
  btn.appendChild(code360GetGitIcon());
  btn.insertAdjacentText('beforeend', ' to GitHub');
  btn.style.cssText = 'cursor:pointer; font-size:13px; margin-left:8px;';
  btn.title = 'Push current solution to GitHub (right-click to add suffix)';

  btn.addEventListener('click', () => {
    code360ShowSpinner();
    handleCode360Submission({ status: 'Accepted' });
  });

  btn.addEventListener('contextmenu', event => {
    event.preventDefault();
    const suffix = prompt(
      'Add a suffix for this solution file, i.e., -bfs, -dfs. \r\nWe don\'t recommend special characters except "-".',
    );
    if (suffix && suffix.trim()) {
      code360ShowSpinner();
      handleCode360Submission({ status: 'Accepted', suffix: suffix.trim() });
    }
  });

  if (submitBtn.parentElement) {
    submitBtn.parentElement.insertBefore(btn, submitBtn);
  }
}

// Inject manual push button after editor is ready
setTimeout(() => {
  const host = window.location.hostname;
  if (!host.includes('codingninjas.com') && !host.includes('naukri.com')) return;
  code360AddManualPushButton();
  // Retry a few times in case editor loads after content script
  let retries = 0;
  const retryInterval = setInterval(() => {
    code360AddManualPushButton();
    if (++retries > 5) clearInterval(retryInterval);
  }, 2000);
}, 3000);
