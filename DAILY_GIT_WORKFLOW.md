# Daily GitHub Rituals: A Workflow Guide

This guide outlines a safe and professional daily workflow for working with Git and GitHub. Following these rituals will help keep your branches in sync and minimize conflicts.

---

## 1. Starting Your Day: Syncing with `main`

Before you start writing any code, always make sure your local repository, especially your `main` branch and your feature branch, are up-to-date with the latest changes from GitHub.

**Step 1: Update Your Local `main` Branch**
```bash
# Switch to your main branch
git checkout main

# Pull the latest changes from the remote repository on GitHub
git pull origin main
```

**Step 2: Update Your Feature Branch**
Now, update your feature branch with the fresh changes from `main`.
```bash
# Switch back to your feature branch (replace with your branch name)
git checkout feature/db-optimisation

# Merge the updated main branch into your feature branch
git merge main
```
*This is the most important ritual for preventing large, difficult merge conflicts in the future.*

---

## 2. Your Daily Work: Making and Committing Changes

As you work on your feature, you should commit your changes locally in small, logical chunks.

**Step 1: See What Branch You Are On**
If you're ever unsure, this command will show you. The one with the `*` is your current branch.
```bash
git branch
```

**Step 2: See Your Changes**
These commands help you understand the work you've done before you commit it.

```bash
# See which files you have modified
git status

# See the exact line-by-line changes in your modified files
git diff

# See all the changes on your current branch compared to the main branch
git diff main..HEAD
```

**Step 3: Commit Your Work Locally**
This is the standard, safe process for committing your work.

```bash
# Stage all your changes for the next commit
git add .

# Commit the staged changes with a descriptive message
git commit -m "Your descriptive message here"
```

---

## 3. End of the Day: Pushing Your Work

When you've completed a piece of work or want to back up your local commits to GitHub, you push your branch.

```bash
# Push your branch and all its new commits to the remote repository
# (replace with your branch name)
git push origin feature/db-optimisation
```

After you have pushed, you can go to the GitHub website to create a Pull Request (PR) or see your latest changes reflected in an existing PR.
