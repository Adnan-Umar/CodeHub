/* global leethubPushSolution */

const HACKERRANK_PLATFORM_FOLDER = 'HackerRank';

/**
 * Extracts the problem slug from the current HackerRank URL.
 * URL patterns:
 *   https://www.hackerrank.com/challenges/{slug}/problem
 *   https://www.hackerrank.com/contests/{contest}/challenges/{slug}
 */
function getHackerRankProblemSlug() {
  if (!window.location.hostname.includes('hackerrank.com')) return null;
  const path = window.location.pathname;
  const challengeMatch = path.match(/\/challenges\/([^/]+)/);
  if (challengeMatch) return challengeMatch[1];
  return null;
}

/**
 * Reads the solution code from HackerRank's Monaco editor.
 * Modern HR uses Web Components with shadow DOM, so we pierce through
 * shadow roots to find the editor instance.
 */
function getHackerRankCode() {
  // Helper: recursively search through shadow DOMs
  function searchRoot(root, depth = 0) {
    if (depth > 5) return null;

    // Try Monaco models in this root
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

    // Try Ace editor
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

    // Try CodeMirror
    const cm = root.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) {
      const val = cm.CodeMirror.getValue();
      if (val && val.trim().length > 0) return val;
    }

    // Try any textarea with class containing editor/code
    const textarea = root.querySelector('textarea[class*="editor"], textarea[class*="code"]');
    if (textarea) {
      const val = textarea.value || textarea.textContent;
      if (val && val.trim().length > 0) return val;
    }

    // Recurse into child shadow roots
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = searchRoot(el.shadowRoot, depth + 1);
        if (found) return found;
      }
    }

    // Also check the root itself for a shadowRoot property
    if (root.shadowRoot) {
      return searchRoot(root.shadowRoot, depth + 1);
    }

    return null;
  }

  // Start search from document
  const result = searchRoot(document);
  if (result) return result;

  // Global fallback: search all elements with shadowRoot
  const allRoots = document.querySelectorAll('*');
  for (const el of allRoots) {
    if (el.shadowRoot) {
      const found = searchRoot(el.shadowRoot, 1);
      if (found) return found;
    }
  }

  return null;
}

async function getHackerRankCodeWithRetry(attempts = 8, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    const code = getHackerRankCode();
    if (code && code.trim().length > 2) {
      return code;
    }
    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  // Final direct document-level attempt (no shadow DOM)
  return getHackerRankCodeDirect();
}

function getHackerRankCodeDirect() {
  // Direct document-level Monaco check (bypasses shadow DOM entirely)
  if (window.monaco && window.monaco.editor) {
    try {
      const models = window.monaco.editor.getModels();
      if (models && models.length > 0) {
        const val = models[0].getValue();
        if (val && val.trim().length > 2) return val;
      }
      const editors = window.monaco.editor.getEditors();
      if (editors && editors.length > 0) {
        const val = editors[0].getValue();
        if (val && val.trim().length > 2) return val;
      }
    } catch {
      // ignore
    }
  }

  // Look for contenteditable divs that contain code
  const editableDivs = document.querySelectorAll('[contenteditable="true"]');
  for (const div of editableDivs) {
    const val = div.innerText || div.textContent || '';
    if (val && val.trim().length > 2 && /[a-zA-Z]/.test(val)) {
      return val.trim();
    }
  }

  // Look for monaco-container divs
  const monacoContainers = document.querySelectorAll(
    '.monaco-container, .monaco-editor, [data-monaco]',
  );
  for (const container of monacoContainers) {
    const textarea = container.querySelector('textarea');
    if (textarea && textarea.value.trim().length > 2) {
      return textarea.value;
    }
    const codeEl = container.querySelector('code, pre, .line');
    if (codeEl) {
      const val = codeEl.innerText || codeEl.textContent || '';
      if (val.trim().length > 2) return val.trim();
    }
  }

  return null;
}

/**
 * Attempts to detect the active language on HackerRank.
 */
function getHackerRankLanguage() {
  // The language is usually shown in a dropdown
  const langBtn = document.querySelector(
    '.select-language .selected-language, [data-analytics="LanguageSelectDropdown"] .active-lang, .hr-dropdown-trigger span',
  );
  if (langBtn) return langBtn.innerText?.trim() ?? null;
  return null;
}

/**
 * Spinner element management for HackerRank UI
 */
let hrSpinnerElem = null;

function hrShowSpinner() {
  const style = document.createElement('style');
  style.textContent = `.leethub-hr-spinner { display:inline-block;width:1.4em;height:1.4em;border:0.3em solid transparent;border-color:#eee;border-top-color:#3E67EC;border-radius:50%;animation:leethub-spin 1s linear infinite;margin-left:8px;vertical-align:middle;} @keyframes leethub-spin{100%{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  hrSpinnerElem = document.createElement('span');
  hrSpinnerElem.className = 'leethub-hr-spinner';
  hrSpinnerElem.id = 'leethub-hr-indicator';

  // Inject next to submit button (try multiple selectors for HackerRank UI variants)
  let submitBtn = document.querySelector(
    '[data-action="submit"] button, button[data-analytics="CodeEditorSubmit"], [data-testid="submit-button"]',
  );
  // Fallback: find any button containing "Submit" text
  if (!submitBtn) {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text =
        btn.innerText?.trim().toLowerCase() || btn.textContent?.trim().toLowerCase() || '';
      if (text.includes('submit')) {
        submitBtn = btn;
        break;
      }
    }
  }
  // Fallback: fixed position overlay in top-right corner
  if (!submitBtn) {
    hrSpinnerElem.style.position = 'fixed';
    hrSpinnerElem.style.top = '16px';
    hrSpinnerElem.style.right = '16px';
    hrSpinnerElem.style.zIndex = '99999';
    document.body.appendChild(hrSpinnerElem);
  } else if (submitBtn.parentElement) {
    submitBtn.parentElement.appendChild(hrSpinnerElem);
  }
}

function hrMarkSuccess() {
  if (hrSpinnerElem) {
    hrSpinnerElem.className = '';
    hrSpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid #78b13f;border-right:5px solid #78b13f;margin-left:8px;vertical-align:middle;';
  }
}

function hrMarkFailed() {
  if (hrSpinnerElem) {
    hrSpinnerElem.className = '';
    hrSpinnerElem.style.cssText =
      'display:inline-block;transform:rotate(45deg);height:18px;width:9px;border-bottom:5px solid red;border-right:5px solid red;margin-left:8px;vertical-align:middle;';
  }
}

/**
 * Main upload handler — called when the interceptor fires a submission event.
 * @param {object} detail - { status, language, code }
 */
let lastHackerRankUploadKey = '';

async function handleHackerRankSubmission(detail) {
  console.log(`[CodeHub HackerRank] Submission event received:`, detail);

  const problemSlug = detail?.problemSlug || getHackerRankProblemSlug();
  const filenameSuffix = detail?.suffix || null;
  const uploadKey = `${problemSlug}-${detail?.code?.length || 0}-${filenameSuffix || ''}`;
  if (uploadKey && uploadKey === lastHackerRankUploadKey) {
    return;
  }
  const platform = detail?.platform || 'HackerRank';
  const statusStr = (
    detail?.status ||
    detail?.result?.status ||
    detail?.model?.status ||
    detail?.response?.status ||
    ''
  )
    .toString()
    .toLowerCase();
  const isAccepted = statusStr.includes('accepted') || statusStr.includes('congratulations');

  if (!isAccepted) {
    console.log(
      `[CodeHub HackerRank] Submission not accepted, skipping upload. Status:`,
      statusStr,
    );
    console.log(
      `[CodeHub HackerRank] TIP: Use the "Push to GitHub" button in the editor toolbar to upload manually.`,
    );
    return;
  }

  if (!problemSlug) {
    console.error(`[CodeHub HackerRank] Could not determine problem slug from URL.`);
    hrMarkFailed();
    return;
  }

  hrShowSpinner();

  try {
    let code = detail?.code || null;
    if (!code) {
      code = await getHackerRankCodeWithRetry();
    }
    if (!code) {
      // Last resort: try to read from any available source
      code = getHackerRankCodeDirect();
    }
    if (!code) throw new Error('Could not extract solution code from editor.');

    const language = detail?.language || getHackerRankLanguage() || 'text';
    const difficulty = detail?.difficulty || '';

    const problemUrl = window.location.href.split('?')[0];
    const readmeContent = `## [${problemSlug}](${problemUrl})\n\n*Platform: HackerRank*\n`;
    const commitMsg = `Add ${problemSlug} solution (${platform}) - CodeHub`;

    console.log(`[CodeHub HackerRank] Uploading ${problemSlug}...`);
    await leethubPushSolution({
      platformFolder: HACKERRANK_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      commitMsg,
      readmeContent,
      filenameSuffix,
    });

    lastHackerRankUploadKey = uploadKey;
    hrMarkSuccess();
    console.log(`[CodeHub HackerRank] Successfully pushed ${problemSlug}`);
  } catch (err) {
    hrMarkFailed();
    console.error(`[CodeHub HackerRank] Upload failed:`, err.message || err);
  }
}

// Listen for events from the MAIN-world interceptor via postMessage bridge
window.listenCodeHubEvents({
  hackerRankSubmission: detail => handleHackerRankSubmission(detail),
  leetHubHackerRankSubmission: detail => handleHackerRankSubmission(detail),
});

function scanHRResult() {
  if (!window.location.hostname.includes('hackerrank.com')) return false;
  const allElements = document.querySelectorAll('body *');
  for (const el of allElements) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (
      (text.includes('accepted') || text.includes('congratulations')) &&
      el.children.length === 0 &&
      text.length < 100 &&
      !el.dataset.codehubProcessed
    ) {
      el.dataset.codehubProcessed = 'true';
      hrShowSpinner();
      handleHackerRankSubmission({ status: 'Accepted' });
      return true;
    }
  }
  return false;
}

const hrResultObserver = new MutationObserver(() => {
  scanHRResult();
});

// Periodic scan fallback
let hrPollCount = 0;
const hrPollInterval = setInterval(() => {
  if (hrPollCount++ > 40) {
    clearInterval(hrPollInterval);
    return;
  }
  if (!window.location.hostname.includes('hackerrank.com')) return;
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scanHRResult();
  }
}, 1500);

setTimeout(() => {
  if (document.body) {
    hrResultObserver.observe(document.body, { childList: true, subtree: true });
  }
  scanHRResult();
}, 1500);

console.log('[CodeHub] HackerRank content script loaded.');

// ====== Manual Push Button (HackerRank) ======

function hrGetGitIcon() {
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

function hrAddManualPushButton() {
  if (document.getElementById('hrManualGitSubmit')) return;

  const submitBtn = document.querySelector(
    '[data-action="submit"] button, button[data-analytics="CodeEditorSubmit"], [data-testid="submit-button"], .ui-btn-success, .submit-button',
  );
  if (!submitBtn) return;

  const btn = document.createElement('button');
  btn.id = 'hrManualGitSubmit';
  btn.className =
    'ui-btn mx-2 px-3 py-2 rounded font-medium text-sm flex items-center gap-1 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600';
  btn.textContent = 'Push ';
  btn.appendChild(hrGetGitIcon());
  btn.insertAdjacentText('beforeend', ' to GitHub');
  btn.style.cssText = 'cursor:pointer; font-size:13px;';
  btn.title = 'Push current solution to GitHub (right-click to add suffix)';

  btn.addEventListener('click', () => {
    hrShowSpinner();
    handleHackerRankSubmission({ status: 'Accepted' });
  });

  btn.addEventListener('contextmenu', event => {
    event.preventDefault();
    const suffix = prompt(
      'Add a suffix for this solution file, i.e., -bfs, -dfs. \r\nWe don\'t recommend special characters except "-".',
    );
    if (suffix && suffix.trim()) {
      hrShowSpinner();
      handleHackerRankSubmission({ status: 'Accepted', suffix: suffix.trim() });
    }
  });

  if (submitBtn.parentElement) {
    submitBtn.parentElement.insertBefore(btn, submitBtn);
  }
}

// Inject manual push button after editor is ready
setTimeout(() => {
  hrAddManualPushButton();
  // Retry a few times in case editor loads after content script
  let retries = 0;
  const retryInterval = setInterval(() => {
    hrAddManualPushButton();
    if (++retries > 5) clearInterval(retryInterval);
  }, 2000);
}, 3000);
