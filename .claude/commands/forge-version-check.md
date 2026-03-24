---
description: "Check if Claude Code has been updated and suggest ForgeLoop adaptations"
---

A Claude Code version change has been detected. Your job is to figure out what changed and whether ForgeLoop needs updates.

## Steps

1. **Read the current and previous versions:**
   - Current: Run `claude --version`
   - Previous: Read `.forge/memory/.claude-code-version`

2. **Research what changed:**
   - Search for Claude Code changelog or release notes for the current version
   - Focus on: new hooks, new MCP capabilities, new agent features, new skill features, context window changes, new commands

3. **Check ForgeLoop's current configuration against changes:**
   - Read `.claude/settings.local.json` — are there new hook types we should use?
   - Read `.forge/skills/` — do any skills reference deprecated features?
   - Read `.forge/hooks/` — do any hooks use patterns that changed?
   - Check if Agent Teams behavior changed

4. **Generate a ForgeLoop update plan:**
   - List specific ForgeLoop files that need modification
   - Explain what changed in Claude Code and why ForgeLoop needs to adapt
   - Write the plan to `.forge/plans/active-plan.md` as a ForgeLoop maintenance plan

5. **Update the version file:**
   - Write the current version to `.forge/memory/.claude-code-version`

6. **Log the version change in DECISIONS.md**

If nothing relevant changed, just confirm ForgeLoop is compatible and update the version file.
