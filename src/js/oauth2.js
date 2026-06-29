// eslint-disable-next-line no-unused-vars
const oAuth2 = (() => {
  const AUTHORIZATION_URL = 'https://github.com/login/oauth/authorize';
  const CLIENT_ID = 'Ov23ligdD15X72rM6QAg';
  const REDIRECT_URL = 'https://github.com/';
  const SCOPES = ['repo'];

  return {
    begin() {
      const scopeParam = encodeURIComponent(SCOPES.join(' '));
      const url = `${AUTHORIZATION_URL}?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URL}&scope=${scopeParam}`;

      chrome.storage.local.set({ pipe_codehub: true }, () => {
        chrome.tabs.create({ url, active: true }, () => {});
      });
    },
  };
})();
