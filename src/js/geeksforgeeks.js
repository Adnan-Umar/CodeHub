/* global leethubPushSolution */
const GFG_PLATFORM_FOLDER = 'GeeksForGeeks';

const DETECTED_PLATFORM = 'GeeksForGeeks';

function getGFGProblemSlug() {
  const path = window.location.pathname;
  const match = path.match(/\/problems\/([^/]+)/);
  if (match) return match[1];
  return null;
}

function getGFGCode() {
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.CodeMirror) {
    return cm.CodeMirror.getValue();
  }
  const aceEditor = document.querySelector('.ace_editor');
  if (aceEditor && window.ace) {
    try {
      return window.ace.edit(aceEditor).getValue();
    } catch {
      // ignore
    }
  }
  if (window.monaco && window.monaco.editor) {
    const editors = window.monaco.editor.getEditors();
    if (editors && editors.length > 0) return editors[0].getValue();
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

let gfgSpinnerElem = null;

function gfgShowSpinner() {
  const style = document.createElement('style');
  style.textContent = `.leethub-gfg-spinner{display:inline-block;width:1.4em;height:1.4em;border:0.3em solid transparent;border-color:#eee;border-top-color:#2F8D46;border-radius:50%;animation:leethub-gfg-spin 1s linear infinite;margin-left:8px;vertical-align:middle;} @keyframes leethub-gfg-spin{100%{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  gfgSpinnerElem = document.createElement('span');
  gfgSpinnerElem.className = 'leethub-gfg-spinner';
  gfgSpinnerElem.id = 'leethub-gfg-indicator';

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
  const platform = detail?.platform || DETECTED_PLATFORM;

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
    const code = detail?.code || getGFGCode();
    if (!code) throw new Error('Could not extract solution code from editor.');

    const language = detail?.language || getGFGLanguage() || 'text';
    const difficulty = detail?.difficulty || getGFGDifficulty() || '';

    const problemUrl = window.location.href.split('?')[0];
    const title = document.title?.split('|')[0]?.trim() || problemSlug;
    const readmeContent = `## [${title}](${problemUrl})\n\n**Difficulty**: ${difficulty || 'N/A'}  \n*Platform: GeeksForGeeks*\n`;
    const commitMsg = `Add ${problemSlug} solution (${platform}) - CodeHub`;

    await leethubPushSolution({
      platformFolder: GFG_PLATFORM_FOLDER,
      problemName: problemSlug,
      difficulty,
      code,
      language,
      commitMsg,
      readmeContent,
    });

    gfgMarkSuccess();
    console.log(`[CodeHub GFG] Successfully pushed ${problemSlug}`);
  } catch (err) {
    gfgMarkFailed();
    console.error(`[CodeHub GFG] Upload failed:`, err);
  }
}

window.listenCodeHubEvents({
  gfgSubmission: detail => handleGFGSubmission(detail),
  leetHubGFGSubmission: detail => handleGFGSubmission(detail),
});

const gfgResultObserver = new MutationObserver(() => {
  const resultElem = document.querySelector(
    '[class*="result-ac"], [class*="accepted"], .verdict.accepted, .text-green',
  );
  if (resultElem && !resultElem.dataset.codehubProcessed) {
    resultElem.dataset.codehubProcessed = 'true';
    handleGFGSubmission({ status: 'Accepted' });
  }
});

setTimeout(() => {
  gfgResultObserver.observe(document.body, { childList: true, subtree: true });
}, 2000);

console.log('[CodeHub] GeeksForGeeks content script loaded.');
