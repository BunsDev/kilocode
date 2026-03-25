# Modes / Agents Sub-Tab Parity

**Priority:** P1

The legacy "Modes" sub-tab was a 1794-line component with comprehensive mode management. The new "Agents" sub-tab is functional but missing significant features. This doc covers all gaps.

## Side-by-Side Comparison

### Mode/Agent CRUD

| Feature                  | Legacy (Modes)                                                                                                      | New (Agents)                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| View modes/agents list   | List with name + slug                                                                                               | List with name + description                                                                                         |
| Select mode to configure | Popover/Command searchable combobox                                                                                 | Per-agent config exists but the agent selector `<Select>` is defined but not rendered — config panel is inaccessible |
| Create new mode          | Full dialog: name, slug, save location, role definition, description, when-to-use, tool groups, custom instructions | Not available                                                                                                        |
| Delete custom mode       | Confirmation dialog                                                                                                 | Remove button with confirmation                                                                                      |
| Rename custom mode       | Inline text field with save/cancel                                                                                  | Not available                                                                                                        |
| Export mode              | Export to file button                                                                                               | Not available                                                                                                        |
| Import mode              | Import dialog (project/global)                                                                                      | Not available                                                                                                        |
| Edit modes config (JSON) | Dropdown: "Edit Global Modes" / "Edit Project Modes"                                                                | Not available                                                                                                        |
| Marketplace button       | Opens mode marketplace                                                                                              | Not available                                                                                                        |

### Per-Mode/Agent Settings

| Setting                              | Legacy                                                             | New                                                                      |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| API Configuration (provider profile) | `<Select>` dropdown of all API config profiles                     | Not available (CLI doesn't have profiles; has per-agent `model` instead) |
| Role Definition                      | `<TextArea>` (5 rows) + reset button for built-ins                 | Maps to per-agent `prompt` field — text field exists                     |
| Description                          | `<TextField>` + reset button                                       | Read-only in agent list; not editable                                    |
| When to Use                          | `<TextArea>` (4 rows) + reset button                               | Not available                                                            |
| Tools (tool groups)                  | Checkbox grid per group, file regex restrictions                   | Not available                                                            |
| Custom Instructions (per-mode)       | `<TextArea>` (10 rows) + link to `.kilocode/rules-{slug}/rules.md` | Not available as separate field (merged into `prompt`?)                  |
| Temperature                          | Not in legacy Modes sub-tab (was in provider profile)              | `<TextField>` per agent                                                  |
| Top P                                | Not in legacy Modes sub-tab                                        | `<TextField>` per agent                                                  |
| Max Steps                            | Not in legacy Modes sub-tab                                        | `<TextField>` per agent                                                  |
| Model Override                       | Not in legacy Modes sub-tab (was via API config)                   | `<TextField>` per agent                                                  |

### System Prompt Features

| Feature                | Legacy                                                            | New           |
| ---------------------- | ----------------------------------------------------------------- | ------------- |
| Preview System Prompt  | Button to view full rendered prompt in slide-out panel            | Not available |
| Copy System Prompt     | Clipboard button                                                  | Not available |
| Override System Prompt | Advanced disclosure with link to `.kilocode/system-prompt-{slug}` | Not available |

### Global Custom Instructions

| Feature                          | Legacy                                     | New                                                                                |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Global Custom Instructions field | `<TextArea>` (4 rows) inside Modes sub-tab | Not available in Agents sub-tab (Rules sub-tab has instruction file paths instead) |
| Link to global rules file        | Link to `.kilocode/rules/rules.md`         | Not available                                                                      |

### Organization Features

| Feature                   | Legacy                                            | New           |
| ------------------------- | ------------------------------------------------- | ------------- |
| Share modes banner        | `KiloShareModesBanner` component                  | Not available |
| Organization mode warning | Warning when mode has `source === "organization"` | Not available |

### CLI Agent Fields Not Exposed

These are CLI capabilities beyond what the legacy had:

| CLI Field                | Type                           | Description                                          |
| ------------------------ | ------------------------------ | ---------------------------------------------------- |
| `agent[name].variant`    | string                         | Default thinking/reasoning variant (low/medium/high) |
| `agent[name].permission` | Permission                     | Per-agent tool permission overrides                  |
| `agent[name].hidden`     | boolean                        | Hide agent from mode switcher                        |
| `agent[name].disable`    | boolean                        | Fully disable agent                                  |
| `agent[name].mode`       | "subagent" / "primary" / "all" | Agent visibility context                             |
| `agent[name].color`      | string                         | Agent identification color                           |
| `agent[name].options`    | Record                         | Arbitrary key-value config                           |

## Remaining Work

### Critical (P1)

- **Fix agent selector rendering**: The `agentSelectorOptions` memo is defined but the `<Select>` component for choosing which agent to configure is not rendered — the per-agent config panel (model, prompt, temperature, etc.) is inaccessible
- **Create Agent dialog**: Port the mode creation flow — dialog with name, role definition/prompt, description, and other agent config fields. Write to CLI config via `updateConfig()`
- **Description editing**: Make the description field editable for custom agents (currently read-only)

### Important (P2)

- **Tool group management**: If the CLI supports per-agent tool restrictions, add a checkbox grid for tool groups similar to the legacy
- **When to Use field**: Add a text area for orchestrator routing hints (if CLI supports it)
- **System prompt preview**: Add a button to view the full rendered system prompt — requires a CLI endpoint to return the assembled prompt for an agent
- **Rename agent**: Allow renaming custom agents inline
- **Import/Export**: Add import (from file) and export (to file) for agent/mode definitions
- **Default variant per agent**: Expose `agent[name].variant` for persistent thinking effort defaults
- **Hidden/disable toggles**: Add visibility controls for agents

### Nice to Have (P3)

- **Edit config JSON buttons**: Quick links to open the raw config file for global/project agent config
- **Marketplace integration**: Button to open mode marketplace (covered by marketplace.md)
- **Organization mode features**: Share modes banner and org mode warning (depends on org feature implementation)
- **Agent mode selector**: Dropdown for subagent/primary/all
- **Color picker**: Visual agent identification
- **Per-agent permissions**: Collapsible permission override section per agent
- **Copy system prompt**: Clipboard button for the assembled prompt
