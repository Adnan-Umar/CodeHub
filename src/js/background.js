const displayWelcomePage = () => {
  const url = chrome.runtime.getURL('src/html/welcome.html');
  chrome.tabs.create({ url: url, active: true });
};

const closeTab = () => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
    chrome.tabs.remove(tabs[0].id);
  });
};

const handleMessage = request => {
  if (!request) {
    console.log('Received undefined message');
    return;
  }

  if (request.action === 'customCommitMessageUpdated') {
    chrome.storage.local.set({ custom_commit_message: request.message });
  }

  if (request.closeWebPage) {
    if (request.isSuccess) {
      chrome.storage.local.set({ codehub_username: request.username });
      chrome.storage.local.set({ codehub_token: request.token });
      chrome.storage.local.set({ pipe_codehub: false }, () => {});
      closeTab();
      displayWelcomePage();
    } else {
      alert('Error while trying to authenticate your profile!');
      closeTab();
    }
  }
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request) {
    sendResponse({
      ok: false,
      status: 400,
      json: null,
      text: 'Invalid request',
      error: 'No request payload',
    });
    return;
  }

  handleMessage(request);

  if (request?.type !== 'CODEHUB_GITHUB_REQUEST') {
    return;
  }

  const { url, method = 'GET', headers = {}, body } = request.payload || {};

  fetch(url, { method, headers, body })
    .then(async res => {
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      sendResponse({ ok: res.ok, status: res.status, json, text });
    })
    .catch(err => {
      sendResponse({ ok: false, status: 0, json: null, text: '', error: err.message });
    });

  return true;
});
