// Store reference to solution posts for communication with content script
window.leetHubSolutionPosts = [];

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
  ];
  const status = candidates.find(value => typeof value === 'string');
  return status ? status.toLowerCase() : '';
}

function isAcceptedDetail(detail, platform) {
  const status = getAcceptedStatus(detail);
  if (platform === 'hackerrank') {
    return status.includes('accepted');
  }
  if (platform === 'gfg') {
    return status.includes('accepted') || status === 'ac';
  }
  if (platform === 'codingninjas') {
    return status === 'ac' || status.includes('accepted');
  }
  return false;
}

function emitSubmissionEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
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
      responseData?.code,
  };

  if (/hackerrank\.com/.test(loweredUrl) && /submissions|submit/.test(loweredUrl)) {
    if (isAcceptedDetail(detail, 'hackerrank')) {
      emitSubmissionEvent('hackerRankSubmission', detail);
    }
  }

  if (/geeksforgeeks\.(org|com)/.test(loweredUrl) && /submit|problem/.test(loweredUrl)) {
    if (isAcceptedDetail(detail, 'gfg')) {
      emitSubmissionEvent('gfgSubmission', detail);
    }
  }

  if (
    (/codingninjas\.com/.test(loweredUrl) || /naukri\.com\/code360/.test(loweredUrl)) &&
    /submit/.test(loweredUrl)
  ) {
    if (isAcceptedDetail(detail, 'codingninjas')) {
      emitSubmissionEvent('codingNinjasSubmission', detail);
    }
  }
}

// 1. Intercept fetch requests
const originalFetch = window.fetch;

window.fetch = async function (...args) {
  const [resource, options] = args;
  const url = typeof resource === 'string' ? resource : resource?.url;
  const method = options?.method || 'GET';

  console.log('[LeetHub Fetch Intercept]', url, method);

  const response = await originalFetch.apply(this, args);
  const clonedResponse = response.clone();

  handlePlatformResponse(url, method, options?.body, await clonedResponse.text());

  if (url?.includes('/problems/') && url?.includes('/submit/')) {
    try {
      const data = await response.clone().json();

      if (data?.submission_id) {
        console.log('LeetHub: Submission ID detected', data.submission_id);
        window.dispatchEvent(
          new CustomEvent('leetHubSubmissionId', {
            detail: { submissionId: data.submission_id },
          }),
        );
      }
    } catch (e) {
      console.log('LeetHub: Error parsing submission response', e);
    }
  }

  if (url?.includes('/graphql/') && method === 'POST') {
    console.log('LeetHub: GraphQL POST detected via fetch');
    try {
      const body = JSON.parse(options?.body || '{}');
      console.log('LeetHub: GraphQL operation:', body.operationName);
      if (body.operationName === 'ugcArticlePublishSolution') {
        console.log('LeetHub: Solution post operation detected!');
        const solutionData = body.variables?.data;
        console.log('LeetHub: Solution data:', solutionData);
        if (solutionData?.questionSlug && solutionData?.content) {
          console.log('LeetHub: Valid solution data found, storing for processing...');
          // Store the solution data for the content script to process
          window.leetHubSolutionPosts.push({
            questionSlug: solutionData.questionSlug,
            content: solutionData.content,
            title: solutionData.title,
            timestamp: Date.now(),
          });

          window.dispatchEvent(
            new CustomEvent('leetHubSolutionPost', {
              detail: {
                questionSlug: solutionData.questionSlug,
                content: solutionData.content,
                title: solutionData.title,
              },
            }),
          );
        } else {
          console.log('LeetHub: Missing questionSlug or content in solution data');
        }
      }
    } catch (error) {
      console.log('LeetHub: Error parsing GraphQL body:', error);
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
  console.log('LeetHub: XHR open intercepted', method, url);
  return originalXHROpen.apply(this, [method, url, ...args]);
};

XMLHttpRequest.prototype.send = function (data) {
  this.addEventListener('load', () => {
    handlePlatformResponse(this._leethub_url, this._leethub_method, data, this.responseText);
  });

  if (this._leethub_url?.includes('/graphql/') && this._leethub_method === 'POST') {
    console.log('LeetHub: GraphQL POST detected via XHR');

    try {
      const body = JSON.parse(data || '{}');
      console.log('LeetHub: XHR GraphQL operation:', body.operationName);
      if (body.operationName === 'ugcArticlePublishSolution') {
        console.log('LeetHub: Solution post operation detected via XHR!');
        const solutionData = body.variables?.data;
        console.log('LeetHub: XHR Solution data:', solutionData);
        if (solutionData?.questionSlug && solutionData?.content) {
          console.log('LeetHub: Valid solution data found via XHR, storing for processing...');
          // Store the solution data for the content script to process
          window.leetHubSolutionPosts.push({
            questionSlug: solutionData.questionSlug,
            content: solutionData.content,
            title: solutionData.title,
            timestamp: Date.now(),
          });
          // Dispatch custom event to notify content script
          window.dispatchEvent(
            new CustomEvent('leetHubSolutionPost', {
              detail: {
                questionSlug: solutionData.questionSlug,
                content: solutionData.content,
                title: solutionData.title,
              },
            }),
          );
        } else {
          console.log('LeetHub: Missing questionSlug or content in XHR solution data');
        }
      }
    } catch (error) {
      console.log('LeetHub: Error parsing XHR GraphQL body:', error);
    }
  }

  return originalXHRSend.apply(this, [data]);
};

console.log('LeetHub: Request interceptors installed in page context');
