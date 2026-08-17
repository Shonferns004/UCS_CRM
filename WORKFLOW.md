# UCS CRM - Git Workflow Guide

## The 3 Branches

```
developer  ──PR──>  master  ──PR──>  main
   (YOU)          (TESTERS)      (PRODUCTION)
```

| Branch | Who Uses It | What It Does | Deploys To |
|--------|-------------|--------------|------------|
| `developer` | Developers | Write new code | Test Environment |
| `master` | Testers / QA | Test the code | Test Environment |
| `main` | Team Lead / You | Production website | LIVE Website |

---

## How to Start Working

### Step 1: Get the latest code
```bash
git checkout developer
git pull origin developer
```

### Step 2: Create your feature branch
```bash
git checkout -b feature/your-feature-name
```
Example: `git checkout -b feature/add-login-page`

### Step 3: Write your code
Make changes to files as needed.

### Step 4: Save your work
```bash
git add .
git commit -m "feat: add login page"
```

### Step 5: Push to GitHub
```bash
git push origin feature/your-feature-name
```

---

## How to Create a Pull Request (PR)

1. Go to GitHub: `https://github.com/Shonferns004/UCS_CRM`
2. Click "Compare & pull request"
3. Select base branch:
   - For testing: `developer`
   - For production: `main`
4. Click "Create pull request"

---

## The Complete Flow

```
YOUR CODE
    │
    ▼
feature/xyz ──PR──> developer ──PR──> master ──PR──> main
    │                  │                │              │
    │              TEST ENV          TEST ENV      PRODUCTION
    │           (auto deploy)     (auto deploy)  (auto deploy)
    │
    └── You work here
```

### What Happens at Each Stage:

1. **You push to `feature/xyz`**
   - Nothing deploys yet
   - Your code is safe on your branch

2. **PR to `developer`**
   - Auto-deploys to test environment
   - URL: `test-api.beingsevak.org` (backend)
   - URL: `test-crm.beingsevak.org` (frontend)
   - **Testers check your code here**

3. **PR to `master`**
   - Still on test environment
   - Final testing before production
   - **Testers verify one more time**

4. **PR to `main`**
   - **GOES TO PRODUCTION**
   - URL: `api.beingsevak.org` (backend)
   - URL: `beingsevak.org` (frontend)
   - **Only merge when 100% sure**

---

## Quick Commands Reference

| I want to... | Command |
|--------------|---------|
| Start new work | `git checkout developer && git pull && git checkout -b feature/name` |
| Push my changes | `git push origin feature/name` |
| Switch to my branch | `git checkout feature/name` |
| See all branches | `git branch -a` |
| Update from remote | `git pull origin developer` |
| Delete local branch | `git branch -d feature/name` |
| Delete remote branch | `git push origin --delete feature/name` |

---

## Branch Protection Rules

- **`main`**: No direct pushes. Only PRs allowed.
- **`master`**: No direct pushes. Only PRs allowed.
- **`developer`**: No direct pushes. Only PRs allowed.

---

## Common Mistakes to Avoid

### DON'T
- Push directly to `main`
- Push directly to `master`
- Merge code without testing
- Skip the test environment

### DO
- Always create a feature branch
- Always test on test environment first
- Always create PRs
- Always get code reviewed before production

---

## URLs

| Environment | Frontend | Backend |
|-------------|----------|---------|
| **Test** | https://test-crm.beingsevak.org | https://test-api.beingsevak.org |
| **Production** | https://beingsevak.org | https://api.beingsevak.org |

---

## Need Help?

- Check this file first
- Ask the team lead
- Don't guess - ask!
