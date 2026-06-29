# Transitioning CodeHub to Open Source

This guide provides actionable steps for transitioning this project from private to open-source.

## 1. Pre-Transition Preparation

### Code Audit
- [ ] **Remove hardcoded secrets**: Ensure no API keys, tokens, or credentials are in the codebase. Current project uses `.env` (gitignored) and hardcoded placeholders in `authorize.js` and `oauth2.js` - these should remain as placeholders for users to fill in.
- [ ] **Remove internal references**: Check for company/project names, internal URLs, or proprietary comments that shouldn't be public.
- [ ] **Add `.env.example`**: Create a template file showing required environment variables without actual values.

### Documentation Readiness
- [ ] **Enhance README**: The current README is comprehensive. Ensure it includes clear installation instructions for contributors.
- [ ] **Add architecture diagram**: Already present in README - keep it updated.
- [ ] **Document secrets setup**: Add clear instructions for obtaining OAuth credentials.

### CI/CD Preparation
- [ ] **Add GitHub Actions workflow**: Create `.github/workflows/ci.yml` for automated testing and linting.
- [ ] **Enable Dependabot**: Add `.github/dependabot.yml` for automated dependency updates.

## 2. License Selection

### Current License Analysis
The project currently uses **MIT License**, which is appropriate for this use case.

### License Recommendations by Use Case

| License | Use When | Allows Commercial Use | Requires Attribution | Copyleft |
|---------|----------|---------------------|-------------------|----------|
| **MIT** (Current) | General purpose, permissive | ✅ Yes | ✅ Yes | ❌ No |
| Apache 2.0 | Patent protection needed | ✅ Yes | ✅ Yes | ❌ No |
| GPLv3 | Must stay open-source | ✅ Yes | ✅ Yes | ✅ Strong |
| BSD-3-Clause | Academic/BSD ecosystem | ✅ Yes | ✅ Yes | ❌ No |

**Recommendation**: **Keep MIT License** - it's permissive, widely understood, and compatible with most ecosystems. Change only if patent protection (Apache 2.0) or copyleft (GPLv3) is specifically required.

## 3. Repository Setup

### GitHub Configuration
```bash
# Remove private flag (already set to private: true in package.json)
# Update package.json to remove "private": true or set to false
```

### Branch Protection
- Enable branch protection on `main` branch
- Require status checks (CI passes)
- Require pull request reviews

### Community Files
- ✅ `LICENSE` - already exists
- ✅ `README.md` - already comprehensive
- [ ] `CONTRIBUTING.md` - needs creation
- ✅ `ISSUE_TEMPLATE/` - already exists
- [ ] `CODE_OF_CONDUCT.md` - recommended
- [ ] `SECURITY.md` - recommended for responsible disclosure

## 4. Development Workflow Setup

### npm Scripts
The project already has:
- `npm run setup` - install dependencies
- `npm run format` - auto-format with Prettier
- `npm run format-test` - check formatting
- `npm run lint` - lint and auto-fix

### Recommended Additions
```json
"scripts": {
  "prepare": "husky install",
  "test": "node scripts/test-core-logic.mjs",
  "test:watch": "node scripts/test-core-logic.mjs --watch"
}
```

## 5. Security Considerations

### For OAuth Implementation
- Users create their own OAuth apps - no shared secrets
- Document the process clearly in README
- Consider adding a build step to inject credentials at runtime instead of hardcoded values

### For Extension Distribution
- Code signing is not required for Chrome extensions
- Consider publishing to Chrome Web Store for easier distribution
- Add CSP meta tags if needed for web-distributed components

## 6. Release Process

### Versioning Strategy
- Current: `0.0.16` (patch-level changes)
- Recommended: Follow semantic versioning (MAJOR.MINOR.PATCH)
- Pre-release: `0.x.y` while in beta

### GitHub Releases
- Create annotated git tags: `git tag -a v1.0.0 -m "First release"`
- Use GitHub Releases for distribution
- Consider automated release notes generation

## 7. Community Building

### Communication Channels
1. **GitHub Discussions** - Enable for Q&A and community interaction
2. **Issue labels**: `good first issue`, `help wanted`, `bug`, `enhancement`
3. **Roadmap**: Consider adding `ROADMAP.md` or using GitHub Projects

### Documentation for Contributors
- CONTRIBUTING.md (create)
- CODE_OF_CONDUCT.md (create)
- Inline code comments for complex logic
- Architecture documentation (partially in README)

## 8. Checklist Before Going Public

- [ ] All secrets removed or properly documented
- [ ] LICENSE file verified and correct
- [ ] CONTRIBUTING.md created
- [ ] CODE_OF_CONDUCT.md created (optional but recommended)
- [ ] SECURITY.md created for vulnerability reporting
- [ ] CI/CD workflows configured
- [ ] Issue templates verified
- [ ] README installation instructions tested
- [ ] Repository visibility changed to public
- [ ] Optional: Add to awesome lists or social media announcement

---

## Quick Reference Commands

```bash
# Initial setup
npm run setup

# Format code
npm run format

# Check formatting
npm run format-test

# Lint code
npm run lint

# Run tests
node scripts/test-core-logic.mjs

# Create release tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```