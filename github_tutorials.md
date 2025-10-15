# A Practical Guide to Git & GitHub

This guide explains the core concepts of Git and GitHub and provides a standard workflow for making changes to your projects.

## 1. Core Concepts (How Things Work)

### The Two Repositories: Local and Remote

The most important concept is that your project exists in at least two places:
- **Your Local Repository:** The code on your laptop. This is your private workspace where you make and save changes.
- **The Remote Repository (`origin`):** The code on the GitHub server. This is the public, shared, central source of truth.

The goal is to keep these two places in sync.
- `git fetch`: Downloads commits and updates remote-tracking branches in your local repo **without** modifying your working tree or current branch. Use this to safely inspect remote changes before merging.
- `git pull`: A convenience command that runs `git fetch` **plus** a merge (or rebase) into your current branch. Use this when you're ready to bring remote changes directly into your current branch.
- **Example workflow:**
  ```sh
  git fetch origin main      # Safely get updates without changing your files
  git log origin/main..main  # Compare your branch with remote changes
  git pull origin main       # Actually merge remote changes into your branch
  ```
- **Alternative:** `git pull --rebase origin main` - Same as `git pull` but uses rebase instead of merge to create a linear history.
- `git push`: Uploads changes from your Local repo to the Remote.

### Saving Your Work: Commits

A **commit** is a "snapshot" or a "save point" of your entire project at a specific moment in time. It's not just the file you changed; it's the whole project. Every commit has a unique ID (a "hash") and a message describing the change.

Saving work is a two-step process:
1.  `git add [filename]`: This command doesn't save anything. It just adds your changed file to the "staging area," which is like a list of files you *plan* to include in your next save point.
2.  `git commit -m "Your message"`: This command takes everything in the staging area and creates a new snapshot (a commit) with your message.

### Working in Parallel: Branches

The `main` branch should always be stable, clean, and working. You should never work directly on it.

Instead, you create a **branch**. A branch is like making a copy of the project where you can work in a parallel universe. You can make changes, commit, and even make mistakes on your branch without affecting the stable `main` branch.

### Combining Work: Merging and Pull Requests

- **Merging:** This is the act of taking the commits from one branch and combining them into another. For example, merging your feature branch into `main`.
- **Merge Conflict:** A conflict happens when the same lines of code have been changed on both branches. Git stops and asks you, the human, to resolve it. This is a normal safety feature.
- **Pull Request (PR):** A PR is a feature of the GitHub website, not of Git itself. It is a formal *request* to merge your branch into `main`. It's a place to review the code, have a discussion, and run automated checks before the final merge happens.

---

## 2. The Standard Feature Branch Workflow

This is a safe and repeatable process for adding new features or fixing bugs.

1.  **(On GitHub):** Create an "Issue" to track the work you plan to do (e.g., "Issue #4: Add contact form").
2.  **(In Terminal):** Make sure your local `main` is up-to-date.
    ```sh
    git checkout main
    git pull origin main
    ```
3.  **(In Terminal):** Create a new, descriptive branch for your task.
    ```sh
    git checkout -b feat/contact-form
    ```
4.  **(In Editor):** Do all your work (write code, fix bugs).
5.  **(In Terminal):** Commit your changes as you go.
    ```sh
    git add .
    git commit -m "feat: Add basic structure for contact form"
    ```
6.  **(In Terminal):** When the feature is complete, push your branch to GitHub.
    ```sh
    git push origin feat/contact-form
    ```
7.  **(On GitHub):** Go to your repository. Click the "Compare & pull request" button. Give it a title and link the issue in the description (e.g., "Closes #4").
8.  **(On GitHub):** On the Pull Request page, review your changes and click "Merge pull request".
9.  **(On GitHub):** After merging, it's safe to click the "Delete branch" button.
10. **(In Terminal):** Switch back to `main` and pull again to get the changes you just merged.
    ```sh
    git checkout main
    git pull origin main
    ```

---

## 3. Essential CLI Commands (Cheatsheet)

### Everyday Workflow
- `git status`: Shows the current state of your branch and any uncommitted changes. (Run this often!)
- `git add [filename]` or `git add .`: Stages changes for the next commit.
- `git commit -m "Your message"`: Creates a new commit.
- `git push origin [branch-name]`: Uploads your committed changes to GitHub.
- `git pull origin [branch-name]`: Fetches changes from GitHub and merges them into your local branch.
- `git checkout [branch-name]`: Switches your working directory to a different branch.
- `git checkout -b [new-branch-name]`: Creates a new branch and switches to it.

### Inspecting History
- `git log`: Shows the detailed commit history. (Press `q` to quit).
- `git log --oneline`: Shows a compact, one-line view of the history.
- `git diff`: Shows uncommitted changes in your files.
- `git show [commit-hash]`: Shows the details and changes of a specific commit.

### Fixing Mistakes (Advanced)
- `git rebase -i [commit-hash]`: Starts an "interactive rebase" to edit, remove, or combine commits.
- `git rebase --abort`: Cancels a rebase that is in progress.
- `git push --force-with-lease origin [branch-name]`: Used to overwrite a remote branch after you have rewritten its history (e.g., after a rebase).
