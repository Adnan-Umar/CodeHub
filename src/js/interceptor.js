// Store reference to solution posts for communication with content script
window.leetHubSolutionPosts = [];

const CODEHUB_MESSAGE_SOURCE = 'codehub-extension';

function tryParseJson(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractRequestPayload(body) {
  const parsed = tryParseJson(body);
  if (parsed) {
    return parsed;
  }

  if (typeof body !== 'string') {
    return null;
  }

  try {
    const params = new URLSearchParams(body);
    const payload = {};
    for (const [key, value] of params.entries()) {
      payload[key] = value;
    }
    return Object.keys(payload).length > 0 ? payload : null;
  } catch {
    return null;
  }
}

function getAcceptedStatus(detail) {
  const candidates = [
    detail?.status,
    detail?.result?.status,
    detail?.result?.verdict,
    detail?.verdict,
    detail?.data?.status,
    detail?.data?.verdict,
    detail?.response?.status,
    detail?.response?.verdict,
    detail?.response?.model?.status,
    detail?.response?.result?.status,
  ];
  const status = candidates.find(value => typeof value === 'string');
  return status ? status.toLowerCase() : '';
}

function isAcceptedDetail(detail, platform) {
  const status = getAcceptedStatus(detail);
  const response = detail?.response;
  if (platform === 'hackerrank') {
    return (
      status.includes('accepted') ||
      response?.model?.status === 'Accepted' ||
      response?.result?.status === 'Accepted' ||
      response?.status === 'Accepted'
    );
  }
  if (platform === 'gfg') {
    return status.includes('accepted') || status === 'ac' || status.includes('correct');
  }
  if (platform === 'codingninjas') {
    return status === 'ac' || status.includes('accepted') || status.includes('correct');
  }
  return false;
}

function emitCodeHubEvent(eventName, detail) {
  window.postMessage({ source: CODEHUB_MESSAGE_SOURCE, event: eventName, detail }, '*');
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function getXhrResponseText(xhr) {
  if (xhr.responseType === '' || xhr.responseType === 'text') {
    return xhr.responseText || '';
  }
  return '';
}

function extractProblemSlugFromUrl(url, platform) {
  if (!url) return null;
  try {
    const path = new URL(url, window.location.origin).pathname;
    if (platform === 'hackerrank') {
      const match = path.match(/\/challenges\/([^/]+)/);
      return match ? match[1] : null;
    }
    if (platform === 'gfg') {
      const match = path.match(/\/problems\/([^/]+)/);
      return match ? match[1] : null;
    }
    if (platform === 'codingninjas') {
      const match = path.match(/\/problems\/([^/?#]+)/);
      return match ? match[1] : null;
    }
  } catch {
    return null;
  }
  return null;
}

function enrichSubmissionDetail(detail, platform) {
  const platformNames = {
    hackerrank: 'HackerRank',
    gfg: 'GeeksForGeeks',
    codingninjas: 'Code360',
  };
  const problemSlug =
    detail?.problemSlug || extractProblemSlugFromUrl(detail?.url || window.location.href, platform);
  return {
    ...detail,
    problemSlug,
    platform: detail?.platform || platformNames[platform] || platform,
  };
}

function extractSubmissionId(responseData) {
  if (responseData.submission_id != null) {
    return responseData.submission_id;
  }

  const data = responseData.data;
  if (!data) return null;

  const directCandidates = [
    data.submissionId,
    data.submission_id,
    data.submit?.submissionId,
    data.judgeSubmit?.submissionId,
    data.submitJudge?.submissionId,
    data.createSubmission?.submissionId,
  ];
  for (const id of directCandidates) {
    if (id != null) return id;
  }

  const stack = [data];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.submissionId != null) return node.submissionId;
    if (node.submission_id != null) return node.submission_id;
    Object.values(node).forEach(value => {
      if (value && typeof value === 'object') stack.push(value);
    });
  }

  return null;
}

function handlePlatformResponse(url, method, requestBody, responseText) {
  const loweredUrl = (url || '').toLowerCase();
  const responseData = tryParseJson(responseText);
  const requestData = extractRequestPayload(requestBody);
  const detail = {
    url,
    method,
    requestBody: requestData,
    response: responseData,
    status: responseData?.status ?? responseData?.result?.status ?? responseData?.verdict,
    verdict: responseData?.verdict ?? responseData?.result?.verdict,
    language: requestData?.language ?? requestData?.lang ?? responseData?.language,
    code:
      requestData?.code ??
      requestData?.source ??
      requestData?.submissionCode ??
      requestData?.program ??
      requestData?.typed_code ??
      responseData?.code,
  };

  if (/hackerrank\.com/.test(loweredUrl)) {
    if (isAcceptedDetail(detail, 'hackerrank')) {
      emitCodeHubEvent('hackerRankSubmission', enrichSubmissionDetail(detail, 'hackerrank'));
    }
  }

  if (/geeksforgeeks\.(org|com)/.test(loweredUrl)) {
    if (isAcceptedDetail(detail, 'gfg')) {
      emitCodeHubEvent('gfgSubmission', enrichSubmissionDetail(detail, 'gfg'));
    }
  }

  if (/codingninjas\.com/.test(loweredUrl) || /naukri\.com\/code360/.test(loweredUrl)) {
    if (isAcceptedDetail(detail, 'codingninjas')) {
      emitCodeHubEvent('codingNinjasSubmission', enrichSubmissionDetail(detail, 'codingninjas'));
    }
  }
}

function handleLeetCodeSubmitResponse(url, responseData) {
  const submissionId = extractSubmissionId(responseData);
  if (!submissionId) return;

  console.log('CodeHub: Submission ID detected', submissionId);
  emitCodeHubEvent('leetHubSubmissionId', { submissionId });
}

function handleLeetCodeGraphQL(body, responseData) {
  if (!body?.operationName) return;

  const submitOperations = [
    'submit',
    'judgeSubmit',
    'submitJudge',
    'createSubmission',
    'submitCode',
    'runCode',
    'submitSolution',
    'solveQuestion',
    'runSubmittedCode',
  ];
  if (submitOperations.includes(body.operationName)) {
    handleLeetCodeSubmitResponse('/graphql/', responseData);
  }

  if (body.operationName === 'ugcArticlePublishSolution') {
    const solutionData = body.variables?.data;
    if (solutionData?.questionSlug && solutionData?.content) {
      window.leetHubSolutionPosts.push({
        questionSlug: solutionData.questionSlug,
        content: solutionData.content,
        title: solutionData.title,
        timestamp: Date.now(),
      });

      emitCodeHubEvent('leetHubSolutionPost', {
        questionSlug: solutionData.questionSlug,
        content: solutionData.content,
        title: solutionData.title,
      });
    }
  }
}

// 1. Intercept fetch requests
const originalFetch = window.fetch;

window.fetch = async function (...args) {
  const [resource, options] = args;
  const url = typeof resource === 'string' ? resource : resource?.url;
  const method = options?.method || 'GET';

  const response = await originalFetch.apply(this, args);
  const clonedResponse = response.clone();
  const responseText = await clonedResponse.text();

  handlePlatformResponse(url, method, options?.body, responseText);

  if (url?.includes('/problems/') && url?.includes('/submit/')) {
    try {
      const data = tryParseJson(responseText);
      handleLeetCodeSubmitResponse(url, data);
    } catch (e) {
      console.log('CodeHub: Error parsing submission response', e);
    }
  }

  if (url?.includes('/graphql/') && method === 'POST') {
    try {
      const body = JSON.parse(options?.body || '{}');
      const responseData = tryParseJson(responseText);
      handleLeetCodeGraphQL(body, responseData);
    } catch (error) {
      console.log('CodeHub: Error parsing GraphQL body:', error);
    }
  }

  return response;
};

// 2. Intercept XMLHttpRequest (fallback)
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method, url, ...args) {
  this._leethub_url = url;
  this._leethub_method = method;
  return originalXHROpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function (data) {
  this.addEventListener('load', () => {
    const responseText = getXhrResponseText(this);
    handlePlatformResponse(this._leethub_url, this._leethub_method, data, responseText);

    if (this._leethub_url?.includes('/problems/') && this._leethub_url?.includes('/submit/')) {
      try {
        const responseData = tryParseJson(responseText);
        handleLeetCodeSubmitResponse(this._leethub_url, responseData);
      } catch (e) {
        console.log('CodeHub: Error parsing XHR submission response', e);
      }
    }

    if (this._leethub_url?.includes('/graphql/') && this._leethub_method === 'POST') {
      try {
        const body = JSON.parse(data || '{}');
        const responseData = tryParseJson(responseText);
        handleLeetCodeGraphQL(body, responseData);
      } catch (error) {
        console.log('CodeHub: Error parsing XHR GraphQL body:', error);
      }
    }
  });

  return originalXHRSend.apply(this, [data]);
};

console.log('CodeHub: Request interceptors installed in page context');
