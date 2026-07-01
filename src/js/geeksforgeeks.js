/* global codehubPushSolution */
const GFG_PLATFORM_FOLDER = 'GeeksForGeeks';

function getGFGProblemSlug() {
  const host = window.location.hostname;
  if (!host.includes('geeksforgeeks.org') && !host.includes('geeksforgeeks.com')) return null;
  const path = window.location.pathname;
  const match = path.match(/\/problems\/([^/]+)/);
  if (match) return match[1];
  return null;
}

function getGFGCode() {
  function searchRoot(root, depth = 0) {
    if (depth > 5) return null;

    if (root.monaco && root.monaco.editor) {
      try {
        const models = root.monaco.editor.getModels();
        if (models && models.length > 0 && models[0].getValue().trim().length > 0) {
          return models[0].getValue();
        }
        const editors = root.monaco.editor.getEditors();
        if (editors && editors.length > 0 && editors[0].getValue().trim().length > 0) {
          return editors[0].getValue();
        }
      } catch {
        // ignore
      }
    }

    const cm = root.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) {
      const val = cm.CodeMirror.getValue();
      if (val && val.trim().length > 0) return val;
    }

    if (root.ace) {
      try {
        const aceEl = root.querySelector('.ace_editor');
        if (aceEl) {
          const val = root.ace.edit(aceEl).getValue();
          if (val && val.trim().length > 0) return val;
        }
      } catch {
        // ignore
      }
    }

    const textarea = root.querySelector('textarea[class*="editor"], textarea[class*="code"]');
    if (textarea) {
      const val = textarea.value || textarea.textContent;
      if (val && val.trim().length > 0) return val;
    }

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = searchRoot(el.shadowRoot, depth + 1);
        if (found) return found;
      }
    }

    if (root.shadowRoot) {
      return searchRoot(root.shadowRoot, depth + 1);
    }

    return null;
  }

  const result = searchRoot(document);
  if (result) return result;

  const allRoots = document.querySelectorAll('*');
  for (const el of allRoots) {
    if (el.shadowRoot) {
      const found = searchRoot(el.shadowRoot, 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Retries code extraction multiple times with a delay, mirroring HackerRank's
 * approach. GFG's Monaco editor may not be ready immediately after submission.
 *
 * NOTE: Content scripts run in the isolated world, so `window.monaco` / the
 * `root.monaco` checks inside getGFGCode() are mostly no-ops here. The shared
 * DOM scraper (codehubExtractCodeFromDom) is therefore tried first because it
 * reads the rendered lines directly and works reliably cross-world.
 */
async function getGFGCodeWithRetry(attempts = 8, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    // 1. World-agnostic DOM scraper (works from isolated content-script world)
    let code = window.codehubExtractCodeFromDom?.(document) || null;
    // 2. Legacy multi-strategy search (Monaco/Ace via page globals + shadow DOM)
    if (!code) code = getGFGCode();
    if (code && code.trim().length > 2) {
      return code;
    }
    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

function getGFGLanguage() {
  const langSelector = document.querySelector(
    '.selected-lang, .problems_header_content__title__lang, #langDD .active, [class*="lang"] option:checked',
  );
  if (langSelector) return langSelector.innerText?.trim() || langSelector.value;
  return null;
}

function getGFGDifficulty() {
  const diffElem = document.querySelector(
    '[class*="difficulty"], .difficulty, .problem-difficulty, [class*="Difficulty"]',
  );
  if (diffElem) {
    const text = diffElem.innerText?.trim() ?? '';
    if (text.toLowerCase().includes('easy')) return 'Easy';
    if (text.toLowerCase().includes('medium')) return 'Medium';
    if (text.toLowerCase().includes('hard')) return 'Hard';
  }
  return '';
}

/**
 * Scrapes runtime / memory from the GFG submission results so they can feed
 * the shared commit-message template (mirrors LeetCode's behaviour).
 */
function getGFGSubmissionStats() {
  const stats = { time: '', space: '' };
  try {
    const allElements = document.querySelectorAll(
      '[class*="time"], [class*="memory"], .problem_status, [class*="result"]',
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
 * Returns the problem title (used for the README header), preferring the GFG
 * page title with the trailing " | GeeksforGeeks" stripped.
 */
function getGFGProblemTitle() {
  return document.title?.split('|')[0]?.trim() || '';
}

let gfgSpinnerElem = null;

function gfgShowSpinner() {
  const style = document.createElement('style');
  style.textContent = `.codehub-gfg-spinner{display:inline-block;width:1.4em;height:1.4em;border:0.3em solid transparent;border-color:#eee;border-top-color:#2F8D46;border-radius:50%;animation:codehub-gfg-spin 1s linear infinite;margin-left:8px;vertical-align:middle;} @keyframes codehub-gfg-spin{100%{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  gfgSpinnerElem = document.createElement('span');
  gfgSpinnerElem.className = 'codehub-gfg-spinner';
  gfgSpinnerElem.id = 'codehub-gfg-indicator';

  let submitBtn = document.querySelector(
    'button[class*="submit"], button[id*="submit"], .submit_btn button, [data-testid*="submit"]',
  );
  // Fallback: find button with submit text
  if (!submitBtn) {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.innerText?.trim().toLowerCase() || '';
      if (text.includes('submit')) {
        submitBtn = btn;
        break;
      }
    }
  }
  // Fallback: fixed overlay
  if (!submitBtn) {
    gfgSpinnerElem.style.position = 'fixed';
    gfgSpinnerElem.style.top = '16px';
    gfgSpinnerElem.style.right = '16px';
    gfgSpinnerElem.style.zIndex = '99999';
    document.body.appendChild(gfgSpinnerElem);
  } else if (submitBtn.parentElement) {
    submitBtn.parentElement.appendChild(gfgSpinnerElem);
  }
}

function gfgMarkSuccess() {
  if (gfgSpinnerElem) {
    gfgSpinnerElem.className = '';
    gfgSpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid #78b13f;border-right:5px solid #78b13f;margin-left:8px;vertical-align:middle;';
  }
}

function gfgMarkFailed() {
  if (gfgSpinnerElem) {
    gfgSpinnerElem.className = '';
    gfgSpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid red;border-right:5px solid red;margin-left:8px;vertical-align:middle;';
  }
}

async function handleGFGSubmission(detail) {
  console.log(`[CodeHub GFG] Submission event received:`, detail);

  const problemSlug = detail?.problemSlug || getGFGProblemSlug();

  const statusStr = (
    detail?.status ||
    detail?.result?.verdict ||
    detail?.verdict ||
    ''
  ).toLowerCase();

  const isAccepted = statusStr.includes('accepted') || statusStr === 'ac';

  if (!isAccepted) {
    console.log(`[CodeHub GFG] Not accepted, skipping upload. Status:`, statusStr);
    gfgMarkFailed();
    return;
  }

  if (!problemSlug) {
    console.error(`[CodeHub GFG] Could not extract problem slug from URL.`);
    gfgMarkFailed();
    return;
  }

  gfgShowSpinner();

  try {
    const code = detail?.code || (await getGFGCodeWithRetry());
    if (!code) throw new Error('Could not extract solution code from editor.');

    const language = detail?.language || getGFGLanguage() || 'text';
    const difficulty = detail?.difficulty || getGFGDifficulty() || '';
    const { time, space } = getGFGSubmissionStats();
    const title = getGFGProblemTitle() || problemSlug;

    const problemUrl = window.location.href.split('?')[0];
    const difficultyLine = difficulty ? `\n**Difficulty**: ${difficulty}` : '';
    const readmeContent = `## [${title}](${problemUrl})${difficultyLine}\n\n*Platform: GeeksForGeeks*\n`;

    console.log(`[CodeHub GFG] Uploading ${problemSlug}...`);
    await codehubPushSolution({
      platformFolder: GFG_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      readmeContent,
      filenameSuffix: detail?.suffix || null,
      time,
      space,
    });

    gfgMarkSuccess();
    console.log(`[CodeHub GFG] Successfully pushed ${problemSlug}`);
  } catch (err) {
    gfgMarkFailed();
    console.error(`[CodeHub GFG] Upload failed:`, err.message || err);
  }
}

window.listenCodeHubEvents({
  gfgSubmission: detail => handleGFGSubmission(detail),
  codehubGFGSubmission: detail => handleGFGSubmission(detail),
});

function scanGFGResult() {
  const host = window.location.hostname;
  if (!host.includes('geeksforgeeks.org') && !host.includes('geeksforgeeks.com')) return false;
  const allElements = document.querySelectorAll('body *');
  for (const el of allElements) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (
      (text.includes('accepted') || text.includes('congratulations') || text === 'ac') &&
      el.children.length === 0 &&
      text.length < 50 &&
      !el.dataset.codehubProcessed
    ) {
      el.dataset.codehubProcessed = 'true';
      gfgShowSpinner();
      handleGFGSubmission({ status: text.includes('congratulations') ? 'Accepted' : text });
      return true;
    }
  }
  return false;
}

const gfgResultObserver = new MutationObserver(() => {
  scanGFGResult();
});

// Also poll periodically as a fallback
let gfgPollCount = 0;
const gfgPollInterval = setInterval(() => {
  if (gfgPollCount++ > 30) {
    clearInterval(gfgPollInterval);
    return;
  }
  const host = window.location.hostname;
  if (!host.includes('geeksforgeeks.org') && !host.includes('geeksforgeeks.com')) {
    return;
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scanGFGResult();
  }
}, 2000);

setTimeout(() => {
  if (document.body) {
    gfgResultObserver.observe(document.body, { childList: true, subtree: true });
  }
  // Initial scan
  scanGFGResult();
}, 1500);

console.log('[CodeHub] GeeksForGeeks content script loaded.');

// ====== Manual Push Button (GeeksForGeeks) ======

function gfgGetGitIcon() {
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

function gfgAddManualPushButton() {
  const host = window.location.hostname;
  if (!host.includes('geeksforgeeks.org') && !host.includes('geeksforgeeks.com')) return;
  if (document.getElementById('gfgManualGitSubmit')) return;

  const submitBtn = document.querySelector(
    'button[class*="submit"], button[id*="submit"], .submit_btn button, [data-testid*="submit"], button[class*="run"]',
  );
  if (!submitBtn) return;

  const btn = document.createElement('button');
  btn.id = 'gfgManualGitSubmit';
  btn.className =
    'gfg-sc g-btn px-3 py-2 rounded font-medium text-sm flex items-center gap-1 bg-green-600 text-white hover:bg-green-700';
  btn.textContent = 'Push ';
  btn.appendChild(gfgGetGitIcon());
  btn.insertAdjacentText('beforeend', ' to GitHub');
  btn.style.cssText = 'cursor:pointer; font-size:13px; margin-left:8px;';
  btn.title = 'Push current solution to GitHub (right-click to add suffix)';

  btn.addEventListener('click', () => {
    gfgShowSpinner();
    handleGFGSubmission({ status: 'Accepted' });
  });

  btn.addEventListener('contextmenu', event => {
    event.preventDefault();
    const suffix = prompt(
      'Add a suffix for this solution file, i.e., -bfs, -dfs. \r\nWe don\'t recommend special characters except "-".',
    );
    if (suffix && suffix.trim()) {
      gfgShowSpinner();
      handleGFGSubmission({ status: 'Accepted', suffix: suffix.trim() });
    }
  });

  if (submitBtn.parentElement) {
    submitBtn.parentElement.insertBefore(btn, submitBtn);
  }
}

// Inject manual push button after editor is ready
setTimeout(() => {
  const host = window.location.hostname;
  if (!host.includes('geeksforgeeks.org') && !host.includes('geeksforgeeks.com')) return;
  gfgAddManualPushButton();
  // Retry a few times in case editor loads after content script
  let retries = 0;
  const retryInterval = setInterval(() => {
    gfgAddManualPushButton();
    if (++retries > 5) clearInterval(retryInterval);
  }, 2000);
}, 3000);
