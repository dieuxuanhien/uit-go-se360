# GitHub Branch Protection Setup

This document explains how to configure branch protection rules for the `main` branch.

## Prerequisites

- Admin access to the GitHub repository
- GitHub CLI installed (optional but recommended)

## Manual Setup via GitHub Web UI

### Step 1: Navigate to Branch Settings

1. Go to your GitHub repository
2. Click **Settings** → **Branches**
3. Under "Branch protection rules", click **Add rule**

### Step 2: Configure Protection Rule

**Branch name pattern:** `main`

### Step 3: Require Checks to Pass

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Select status checks:
    - `PR - Code Quality & Tests / Code Quality Checks (Lint & Format)`
    - `PR - Code Quality & Tests / TypeScript Type Checking`
    - `PR - Code Quality & Tests / Unit & Integration Tests`
    - `PR - Code Quality & Tests / Terraform Validation`
    - `PR - Code Quality & Tests / Build Docker Images`
    - `PR - Code Quality & Tests / All Checks Passed`

### Step 4: Require Reviews

- ✅ **Require a pull request before merging**
  - Required number of approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require code owner reviews

### Step 5: Restrict Who Can Push

- ✅ **Include administrators**
  - This ensures rules apply to all users

### Step 6: Save

Click **Create** to save the branch protection rule.

---

## Setup via GitHub CLI

```bash
# Install GitHub CLI
# macOS: brew install gh
# Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
# Windows: choco install gh

# Login to GitHub
gh auth login

# Create branch protection rule
gh api repos/{owner}/{repo}/branches/main/protection \
  --input - << 'RULES'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "PR - Code Quality & Tests / Code Quality Checks (Lint & Format)",
      "PR - Code Quality & Tests / TypeScript Type Checking",
      "PR - Code Quality & Tests / Unit & Integration Tests",
      "PR - Code Quality & Tests / Terraform Validation",
      "PR - Code Quality & Tests / Build Docker Images",
      "PR - Code Quality & Tests / All Checks Passed"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
RULES
```

Replace `{owner}` and `{repo}` with your GitHub username/org and repository name.

---

## Verification

After setup, verify by:

1. Creating a test branch and PR
2. Attempting to merge without passing checks (should fail)
3. Attempting to merge without approval (should fail)
4. Confirming merge succeeds once all checks pass and have approval

---

## Troubleshooting

### Status Checks Not Appearing

If status checks don't appear in the dropdown:

1. Ensure CI workflow has run at least once on main branch
2. Workflow names must match exactly:
   - `PR - Code Quality & Tests / Code Quality Checks (Lint & Format)`
   - etc.
3. Trigger a new PR to refresh available checks

### Can't Save Rule

If you get a permission error:

1. Verify you have admin access to the repository
2. Check that the branch exists (usually `main`)
3. Ensure you're not on an archived repository

---

## Reference

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitHub CLI Reference](https://cli.github.com/manual/)
