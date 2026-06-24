/* global leethubPushSolution */

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

let code360SpinnerElem = null;

function code360ShowSpinner() {
  const style = document.createElement('style');
  style.textContent = `.leethub-code360-spinner{display:inline-block;width:1.4em;height:1.4em;border:0.3em solid transparent;border-color:#eee;border-top-color:#4F46E5;border-radius:50%;animation:leethub-code360-spin 1s linear infinite;margin-left:8px;vertical-align:middle;} @keyframes leethub-code360-spin{100%{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  code360SpinnerElem = document.createElement('span');
  code360SpinnerElem.className = 'leethub-code360-spinner';
  code360SpinnerElem.id = 'leethub-code360-indicator';

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
  const platform = detail?.platform || 'Code360';

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
    const code = detail?.code || getCode360Code();
    if (!code) throw new Error('Could not extract solution code.');

    const language = detail?.language || getCode360Language() || 'text';
    const difficulty = detail?.difficulty || getCode360Difficulty() || '';
    const problemUrl = window.location.href.split('?')[0];
    const readmeContent = `## [${problemSlug}](${problemUrl})\n\n*Platform: Code360*\n`;
    const commitMsg = `Add ${problemSlug} solution (${platform}) - CodeHub`;

    console.log(`[CodeHub Code360] Uploading ${problemSlug}...`);
    await leethubPushSolution({
      platformFolder: CODE360_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      commitMsg,
      readmeContent,
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
