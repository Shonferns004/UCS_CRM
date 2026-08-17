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

## Two Repos (Both Stay in Sync)

```
FORK (origin)                         UPSTREAM
Shonferns004/UCS_CRM                  priyankshahdev-alt/UCS_CRM
    |                                       |
    main  ──────────── same code ──────> main
    master ─────────── same code ──────> master
    developer ──────── same code ──────> developer
    |
  ucs-2.0 (your backup branch)
```

- **Fork** = your personal copy (origin)
- **Upstream** = the main repo where deployments happen
- **Always keep both in sync**

---

## VS Code Workflow (Step by Step)

### Step 1: Open Terminal in VS Code
- Press `` Ctrl + ` `` (backtick) to open terminal at bottom

### Step 2: Switch to Developer Branch
```bash
git checkout developer
git pull origin developer
```

Or in VS Code:
- Click **branch name** at bottom-left corner
- Select `developer`

### Step 3: Create Your Feature Branch
```bash
git checkout -b feature/your-feature-name
```

Or in VS Code:
- Click **branch name** at bottom-left
- Type your branch name (e.g. `feature/add-login`)
- Press Enter → it creates and switches to it

### Step 4: Code Your Changes
- Edit files as usual in VS Code
- Save with `Ctrl + S`

### Step 5: Commit Your Changes
1. Open **Source Control** tab (left sidebar, icon looks like a branch)
   - Or press `Ctrl + Shift + G`
2. You'll see your changed files listed
3. Click **+** next to each file to stage it
   - Or click **+** at the top to stage all files
4. Type a commit message at the top
   - Use: `feat: add login page` or `fix: fix dashboard bug`
5. Press `Ctrl + Enter` or click the checkmark to commit

### Step 6: Push to BOTH Repos

In the VS Code terminal:
```bash
git push origin feature/your-feature-name
git push upstream feature/your-feature-name
```

This pushes your code to:
- Your fork (origin)
- The main repo (upstream)

### Step 7: Create Pull Request
1. Go to: https://github.com/priyankshahdev-alt/UCS_CRM
2. Click **"Compare & pull request"** banner
3. Set base branch to: **`developer`**
4. Click **Create pull request**

### Step 8: After PR is Merged
1. In VS Code terminal:
   ```bash
   git checkout developer
   git pull upstream developer
   git push origin developer
   ```
2. Delete your feature branch:
   ```bash
   git branch -d feature/your-feature-name
   ```
3. Repeat the cycle!

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

## VS Code Quick Reference

| I want to... | How to do it in VS Code |
|--------------|------------------------|
| Switch branch | Click branch name (bottom-left) → select branch |
| Create branch | Click branch name → type new name → Enter |
| See changes | Open Source Control tab (Ctrl+Shift+G) |
| Stage files | Click + next to each file |
| Commit | Type message → Ctrl+Enter |
| Push | Terminal: `git push origin branch` + `git push upstream branch` |
| Pull latest | Terminal: `git pull upstream developer` |
| Delete branch | Terminal: `git branch -d branch-name` |

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
- Forget to push to upstream

### DO
- Always create a feature branch
- Always test on test environment first
- Always create PRs
- Always push to both origin AND upstream
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
