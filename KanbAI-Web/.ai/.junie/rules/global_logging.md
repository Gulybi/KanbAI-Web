Filename: .ai/.junie/rules/global_logging.md
Activation (JetBrains setting): Always

# Global Logging & Context Rules (@rule_global_logging)

These rules are **MANDATORY** for every interaction and every active agent. Strict adherence to these rules is the foundation of project accountability, task continuity, and context window optimization.

## 1. 📝 Mandatory Central Logging (`junie_prompts.md`)
The `junie_prompts.md` file located in the project root serves as the long-term memory and audit log for the entire system.

- **When:** You MUST update this file after every meaningful interaction, task completion, architectural decision, or file generation/modification.
- **How:** Always append the new entry to the end of the file. NEVER overwrite or delete previous entries.
- **⚠️ Tool Safety (CRITICAL):** To append, use the `StrReplace` tool targeting the last line of the file and adding new content after it. NEVER use the `Write` tool on this file, as it overwrites the entire file and destroys all previous entries. (Exception: If the file does not exist yet, you may use `Write` for the initial creation).
- **Format (Strict Adherence Required):**
  ```text
  [YYYY-MM-DD HH:mm] | Agent: @[agent_name] | Ticket/Issue: #[id or name]
  - Prompt/Request: [Brief summary of the user's request]
  - Action Taken: [What did you do? e.g., Created feature-x context / Updated frontend validation in XYZ.component.ts]
