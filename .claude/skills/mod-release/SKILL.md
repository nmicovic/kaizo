---
name: mod-release
description: Ship a change to this public repo: version bumps, checks, a safety review of what gets published, then commit and push. Use when committing, pushing, releasing, or bumping a mod's version.
---

# Shipping a change

This repository is public: anyone can read what gets committed, and pushed history is hard to take back.

1. **Checks pass.** Run tsc, `claude plugin validate <mod>`, `claude plugin validate .` and `claude plugin test <mod>`. If the change affects what people see, also look at it on screen (`mod-workflow`, step 4).
2. **Version, when users will notice.** Bump it in both `<mod>/.claude-plugin/plugin.json` and the mod's entry in `.claude-plugin/marketplace.json`: the patch number for fixes, the minor number for new features.
3. **Docs.** The mod's `README.md` describes what users now see, and the mod table in the root `README.md` is current.
4. **Safety review.**
   - Stage files by name, never `git add -A`.
   - Read `git status` and the whole `git diff --cached`.
   - Look for anything private: `git diff --cached | grep -inE '/home/|/users/|@[a-z0-9.-]+\.[a-z]{2,}|token|secret|password|api[_-]?key'`. Model "tokens" in plain prose are fine.
   - `git config --local user.email` must be this repo's identity, not a global or work one.
5. **Ask first.** Show the person the file list and the commit message, and wait for a yes before committing. Ask again before pushing.
6. **The commit message:**
   - one logical change
   - the subject says what changed; the body says what users notice
   - no AI co-author, "Generated with" or similar lines
7. **Push** with `git push`; the remote is already set up.

Rewriting pushed history (amending, rebasing, force-pushing) needs the person's explicit yes every time.
