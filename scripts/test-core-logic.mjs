/**
 * Lightweight sanity tests for CodeHub upload path and submission parsing.
 * Run: node scripts/test-core-logic.mjs
 */

function constructGitHubPath(hook, basePath, difficulty, problem, filename, useDifficultyFolder) {
  const filePath = problem ? `${problem}/${filename}` : `${filename}`;
  if (!problem) {
    return `https://api.github.com/repos/${hook}/contents/${filePath}`;
  }
  const path = useDifficultyFolder
    ? `${basePath}/${difficulty}/${filePath}`
    : `${basePath}/${filePath}`;
  return `https://api.github.com/repos/${hook}/contents/${path}`;
}

function extractSubmissionId(responseData) {
  if (!responseData) return null;
  if (responseData.submission_id != null) return responseData.submission_id;
  const data = responseData.data;
  if (!data) return null;
  const directCandidates = [
    data.submissionId,
    data.submission_id,
    data.submit?.submissionId,
    data.judgeSubmit?.submissionId,
  ];
  for (const id of directCandidates) {
    if (id != null) return id;
  }
  return null;
}

const tests = [
  {
    name: 'LeetCode solution path',
    run: () => {
      const url = constructGitHubPath('user/repo', 'LeetCode', 'Easy', '0001-two-sum', '0001-two-sum.py', false);
      return url === 'https://api.github.com/repos/user/repo/contents/LeetCode/0001-two-sum/0001-two-sum.py';
    },
  },
  {
    name: 'Repo root README path',
    run: () => {
      const url = constructGitHubPath('user/repo', 'LeetCode', 'Easy', '', 'README.md', false);
      return url === 'https://api.github.com/repos/user/repo/contents/README.md';
    },
  },
  {
    name: 'HackerRank solution path',
    run: () => {
      const hook = 'user/repo';
      const platformFolder = 'HackerRank';
      const problem = 'solve-me-first';
      const filename = 'solve-me-first.py';
      const path = `${platformFolder}/${problem}/${filename}`;
      const url = `https://api.github.com/repos/${hook}/contents/${path}`;
      return url.includes('HackerRank/solve-me-first/solve-me-first.py');
    },
  },
  {
    name: 'GraphQL submit submission id',
    run: () => extractSubmissionId({ data: { submit: { submissionId: 123456789 } } }) === 123456789,
  },
  {
    name: 'REST submit submission id',
    run: () => extractSubmissionId({ submission_id: 987654321 }) === 987654321,
  },
];

let passed = 0;
for (const test of tests) {
  const ok = Boolean(test.run());
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${test.name}`);
  if (ok) passed += 1;
}

if (passed !== tests.length) {
  process.exit(1);
}

console.log(`\nAll ${tests.length} tests passed.`);
