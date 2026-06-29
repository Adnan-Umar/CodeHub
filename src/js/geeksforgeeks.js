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
  const platform = detail?.platform || 'GeeksForGeeks';

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

    console.log(`[CodeHub GFG] Uploading ${problemSlug}...`);
    await codehubPushSolution({
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
