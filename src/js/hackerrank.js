/* global leethubPushSolution */

const HACKERRANK_PLATFORM_FOLDER = 'HackerRank';

/**
 * Extracts the problem slug from the current HackerRank URL.
 * URL patterns:
 *   https://www.hackerrank.com/challenges/{slug}/problem
 *   https://www.hackerrank.com/contests/{contest}/challenges/{slug}
 */
function getHackerRankProblemSlug() {
  const path = window.location.pathname;
  const challengeMatch = path.match(/\/challenges\/([^/]+)/);
  if (challengeMatch) return challengeMatch[1];
  return null;
}

/**
 * Reads the solution code from HackerRank's Monaco editor.
 * Falls back to the CodeMirror editor or a textarea if Monaco is not found.
 */
function getHackerRankCode() {
  // Try Monaco editor first (most common)
  if (window.monaco && window.monaco.editor) {
    const editors = window.monaco.editor.getEditors();
    if (editors && editors.length > 0) {
      return editors[0].getValue();
    }
  }
  // Fallback: CodeMirror
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.CodeMirror) {
    return cm.CodeMirror.getValue();
  }
  // Last resort: grab from a textarea
  const textarea = document.querySelector('textarea.editor-input, .editor textarea');
  if (textarea) return textarea.value;
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

  // Inject next to submit button
  const submitBtn = document.querySelector(
    '[data-action="submit"] button, button[data-analytics="CodeEditorSubmit"]',
  );
  if (submitBtn && submitBtn.parentElement) {
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
async function handleHackerRankSubmission(detail) {
  console.log('[LeetHub HackerRank] Submission event received:', detail);

  // Only proceed for accepted submissions
  const isAccepted =
    detail?.status === 'Accepted' ||
    detail?.result?.status === 'Accepted' ||
    detail?.model?.status === 'Accepted';

  if (!isAccepted) {
    console.log('[LeetHub HackerRank] Submission not accepted, skipping upload.');
    hrMarkFailed();
    return;
  }

  hrShowSpinner();

  try {
    const problemSlug = getHackerRankProblemSlug();
    if (!problemSlug) throw new Error('Could not determine problem slug from URL.');

    // Code from event detail (captured from request body) or from editor
    const code = detail?.code || getHackerRankCode();
    if (!code) throw new Error('Could not extract solution code.');

    const language = detail?.language || getHackerRankLanguage() || 'text';
    const difficulty = detail?.difficulty || '';

    // Build a simple README with the problem link
    const problemUrl = window.location.href.split('?')[0];
    const readmeContent = `## [${problemSlug}](${problemUrl})\n\n*Platform: HackerRank*\n`;

    const commitMsg = `Add ${problemSlug} solution (HackerRank) - LeetHub`;

    await leethubPushSolution({
      platformFolder: HACKERRANK_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      commitMsg,
      readmeContent,
    });

    hrMarkSuccess();
    console.log(`[LeetHub HackerRank] Successfully pushed ${problemSlug}`);
  } catch (err) {
    hrMarkFailed();
    console.error('[LeetHub HackerRank] Upload failed:', err);
  }
}

// Listen for the custom event dispatched by interceptor.js
['hackerRankSubmission', 'leetHubHackerRankSubmission'].forEach(eventName => {
  window.addEventListener(eventName, event => {
    handleHackerRankSubmission(event.detail);
  });
});

console.log('[LeetHub] HackerRank content script loaded.');
