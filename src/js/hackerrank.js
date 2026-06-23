/* global leethubPushSolution */

const HACKERRANK_PLATFORM_FOLDER = 'HackerRank';

const DETECTED_PLATFORM = 'HackerRank';

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
      const editors = window.monaco.editor.getEditors();
      if (editors && editors.length > 0) {
        return editors[0].getValue();
      }
    } catch {
      // ignore
    }
  }

  // Try 3: Hidden textarea used by some HR loaders
  const hiddenTextarea = document.querySelector(
    'textarea[class*="editor"], textarea[class*="code"], ._editor-textarea',
  );
  if (hiddenTextarea) {
    return hiddenTextarea.value || hiddenTextarea.textContent;
  }

  // Try 4: CodeMirror legacy
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.CodeMirror) {
    return cm.CodeMirror.getValue();
  }

  // Try 5: Ace editor fallback
  const aceEditor = document.querySelector('.ace_editor');
  if (aceEditor && window.ace) {
    try {
      return window.ace.edit(aceEditor).getValue();
    } catch {
      // ignore
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
  const uploadKey = `${problemSlug}-${detail?.code?.length || 0}`;
  if (uploadKey && uploadKey === lastHackerRankUploadKey) {
    return;
  }
  const platform = detail?.platform || DETECTED_PLATFORM;
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
    return;
  }

  if (!problemSlug) {
    console.error(`[CodeHub HackerRank] Could not determine problem slug from URL.`);
    hrMarkFailed();
    return;
  }

  hrShowSpinner();

  try {
    // Small delay to ensure editor is fully loaded
    await new Promise(resolve => setTimeout(resolve, 300));

    const code = detail?.code || getHackerRankCode();
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

const hrResultObserver = new MutationObserver(() => {
  const accepted = document.querySelector(
    '.submission-message, [class*="accepted"], .status.accepted, .ui-output-status-accepted, .congrats-message',
  );
  if (accepted) {
    const text = accepted.innerText?.toLowerCase() || '';
    if (
      (text.includes('accepted') || text.includes('congratulations')) &&
      !accepted.dataset.codehubProcessed
    ) {
      accepted.dataset.codehubProcessed = 'true';
      hrShowSpinner();
      handleHackerRankSubmission({ status: 'Accepted' });
    }
  }
});

setTimeout(() => {
  if (document.body) {
    hrResultObserver.observe(document.body, { childList: true, subtree: true });
  }
}, 2000);

console.log('[CodeHub] HackerRank content script loaded.');
