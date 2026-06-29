# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in CodeHub, please report it responsibly.

### How to Report

**Please do NOT report security issues through public GitHub issues.** Instead, use one of these methods:

1. **GitHub Security Advisory** (Preferred):
   - Go to the [Security tab](https://github.com/Adnan-Umar/CodeHub/security)
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email**: Send details to the maintainer's email address

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Resolution**: Depends on complexity, typically 1-2 weeks

### Disclosure Policy

- We request that you give us a reasonable amount of time to investigate and fix the vulnerability before public disclosure
- We will credit you in the security advisory (if desired)
- We follow coordinated vulnerability disclosure practices

## Security Considerations

### OAuth Credentials

- Users create their own OAuth apps - no shared secrets exist in the codebase
- The `.env` file and hardcoded credentials should never be committed
- Tokens are stored in `chrome.storage.local` (extension-scoped)

### Extension Permissions

CodeHub requires the following permissions:
- `identity` - For OAuth authentication
- `storage` - For storing user preferences and tokens
- `activeTab` - For content script injection
- Host permissions for coding platforms (LeetCode, HackerRank, GeeksForGeeks, Code360) and GitHub API

### Data Flow

- All code runs client-side in the browser
- No data is sent to third-party servers
- All uploads go directly to the user's GitHub repository via their OAuth token