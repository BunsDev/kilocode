---
title: "The Chat Interface"
description: "Learn how to use the Kilo Code chat interface effectively"
---

# Chatting with Kilo Code

{% callout type="tip" %}
**Bottom line:** Kilo Code is an AI coding assistant that lives in VS Code. You chat with it in plain English, and it writes, edits, and explains code for you.
{% /callout %}

{% callout type="note" title="Prefer quick completions?" %}
If you're typing code in the editor and want AI to finish your line or block, check out [Autocomplete](/docs/code-with-ai/features/autocomplete) instead. Chat is best for larger tasks, explanations, and multi-file changes.
{% /callout %}

## Quick Setup

{% tabs %}
{% tab label="VSCode" %}

Find the Kilo Code icon ({% kilo-code-icon /%}) in VS Code's Primary Side Bar. Click it to open the chat panel.

**Lost the panel?** Go to View > Open View... and search for "Kilo Code"

{% /tab %}
{% tab label="VSCode (Pre-release)" %}

Click the Kilo Code icon ({% kilo-code-icon /%}) in VS Code's Primary Side Bar to open the sidebar chat. You can also pop it out into an editor tab for a larger workspace.

{% /tab %}
{% tab label="CLI" %}

Open your terminal and run `kilo` to launch the interactive TUI. You'll see a prompt where you can start typing requests immediately. The TUI is fully keyboard-driven — no mouse required.

{% /tab %}
{% /tabs %}

## How to Talk to Kilo Code

**The key insight:** Just type what you want in normal English. No special commands needed.

{% image src="/docs/img/typing-your-requests/typing-your-requests.png" alt="Example of typing a request in Kilo Code" width="800" caption="Example of typing a request in Kilo Code" /%}

**Good requests:**

- `create a new file named utils.py and add a function called add that takes two numbers as arguments and returns their sum`
- `in the file @src/components/Button.tsx, change the color of the button to blue`
- `find all instances of the variable oldValue in @/src/App.js and replace them with newValue`

**What makes requests work:**

- **Be specific** - "Fix the bug in `calculateTotal` that returns incorrect results" beats "Fix the code"
- **Use @ mentions** - Reference files and code directly with `@filename`
- **One task at a time** - Break complex work into manageable steps
- **Include examples** - Show the style or format you want

{% callout type="info" title="Chat vs Autocomplete" %}
**Use chat** when you need to describe what you want, ask questions, or make changes across multiple files.

**Use [autocomplete](/docs/code-with-ai/features/autocomplete)** when you're already typing code and want the AI to finish your thought inline.
{% /callout %}

## The Chat Interface

{% tabs %}
{% tab label="VSCode" %}

{% image src="/docs/img/the-chat-interface/the-chat-interface-1.png" alt="Chat interface components labeled with callouts" width="800" caption="Everything you need is right here" /%}

**Essential controls:**

- **Chat history** - See your conversation and task history
- **Input field** - Type your requests here (press Enter to send)
- **Action buttons** - Approve or reject Kilo's proposed changes
- **Plus button** - Start a new task session
- **Mode selector** - Choose how Kilo should approach your task

**Providing context with @-mentions:**

Reference files and other context directly in your message using `@`:

- `@file` - Reference a specific file
- `@url` - Include content from a URL
- `@problems` - Include current VS Code problems
- `@terminal` - Include terminal output
- `@git-changes` - Include uncommitted changes
- `@commit` - Reference a specific commit

{% /tab %}
{% tab label="VSCode (Pre-release)" %}

**Essential controls:**

- **Input prompt** - Type your requests and press Enter to send
- **Action buttons** - Approve or reject proposed changes
- **Agent dropdown** - Switch between agents (e.g. Code, Ask, Plan) from the sidebar
- **Session management** - Start new sessions or resume previous ones

**Providing context:**

The extension automatically passes context from your editor, including your open tabs and active file. You can type `@` in the chat input to get file autocomplete suggestions, or mention file paths naturally in your message (e.g., "update src/utils.ts to add a helper function"). The agent can also discover files on its own using its built-in tools.

{% /tab %}
{% tab label="CLI" %}

**Essential controls:**

- **Input prompt** - Type your requests and press Enter to send
- **Action buttons** - Approve or reject proposed changes
- **Agent cycling** - Switch between agents using keybinds or slash commands
- **Session management** - Start new sessions or resume previous ones

**Providing context:**

Type `@` in the TUI to get file autocomplete suggestions, or mention file paths directly in your message (e.g., "look at src/utils.ts") and the agent will read them. When using the non-interactive `kilo run` command, you can pass `-f path/to/file.ts` to explicitly include files (this flag is not available in the TUI). The agent also has `glob`, `grep`, and `read` tools to discover files on its own.

{% /tab %}
{% /tabs %}

## Quick Interactions

**Click to act:**

- File paths → Opens the file
- URLs → Opens in browser
- Messages → Expand/collapse details
- Code blocks → Copy button appears

**Status signals:**

- Spinning → Kilo is working
- Red → Error occurred
- Green → Success

## Common Mistakes to Avoid

| Instead of this...                | Try this                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| "Fix the code"                    | "Fix the bug in `calculateTotal` that returns incorrect results"                    |
| Assuming Kilo knows context       | Use `@` to reference specific files                                                 |
| Multiple unrelated tasks          | Submit one focused request at a time                                                |
| Technical jargon overload         | Clear, straightforward language works best                                          |
| Using chat for tiny code changes. | Use [autocomplete](/docs/code-with-ai/features/autocomplete) for inline completions |

**Why it matters:** Kilo Code works best when you communicate like you're talking to a smart teammate who needs clear direction.

## Suggested Responses

When Kilo Code needs more information to complete a task, it uses the [`ask_followup_question`](/docs/automate/tools/ask-followup-question) tool. To make responding easier and faster, Kilo Code often provides suggested answers alongside the question.

{% tabs %}
{% tab label="VSCode" %}

{% image src="/docs/img/suggested-responses/suggested-responses.png" alt="Example of Kilo Code asking a question with suggested response buttons below it" width="800" caption="Suggested responses appear as clickable buttons below questions" /%}

**How it works:**

1. **Question Appears** - Kilo Code asks a question using the `ask_followup_question` tool
2. **Suggestions Displayed** - If suggestions are provided, they appear as buttons below the question
3. **Interaction** - You can interact with these suggestions in two ways

**Interacting with suggestions:**

You have two options for using suggested responses:

1. **Direct Selection**:
   - **Action**: Simply click the button containing the answer you want to provide
   - **Result**: The selected answer is immediately sent back to Kilo Code as your response. This is the quickest way to reply if one of the suggestions perfectly matches your intent.

2. **Edit Before Sending**:
   - **Action**:
     - Hold down `Shift` and click the suggestion button
     - _Alternatively_, hover over the suggestion button and click the pencil icon ({% codicon name="edit" /%}) that appears
   - **Result**: The text of the suggestion is copied into the chat input box. You can then modify the text as needed before pressing Enter to send your customized response. This is useful when a suggestion is close but needs minor adjustments.

{% /tab %}
{% tab label="VSCode (Pre-release) & CLI" %}

**How it works:**

1. **Question Appears** - Kilo Code asks a question using the `question` tool
2. **Options Displayed** - Selectable options are presented that you can choose from
3. **Selection** - Pick an option or type a custom response

{% /tab %}
{% /tabs %}

**Benefits:**

- **Speed** - Quickly respond without typing full answers
- **Clarity** - Suggestions often clarify the type of information Kilo Code needs
- **Flexibility** - Edit suggestions to provide precise, customized answers when needed

This feature streamlines the interaction when Kilo Code requires clarification, allowing you to guide the task effectively with minimal effort.

## Tips for Better Workflow

{% tabs %}
{% tab label="VSCode" %}

{% callout type="tip" %}
**Move Kilo Code to the Secondary Side Bar** for a better layout. Right-click on the Kilo Code icon in the Activity Bar and select **Move To → Secondary Side Bar**. This lets you see the Explorer, Search, Source Control, etc. alongside Kilo Code.

{% image src="/docs/img/move-to-secondary.png" alt="Move to Secondary Side Bar" width="600" caption="Move Kilo Code to the Secondary Side Bar for better workspace organization" /%}
{% /callout %}

{% callout type="tip" %}
**Drag files directly into chat.** Once you have Kilo Code in a separate sidebar from the file explorer, you can drag files from the explorer into the chat window (even multiple at once). Just hold down the Shift key after you start dragging the files.
{% /callout %}

{% /tab %}
{% tab label="VSCode (Pre-release)" %}

{% callout type="tip" %}
**Use agents instead of modes.** Switch between agents like Code, Ask, and Plan using the agent dropdown or slash commands. Each agent is tuned for a different type of task.
{% /callout %}

{% callout type="tip" %}
**Your editor context is automatic.** The extension reads your open tabs and active file, so you don't need to manually reference every file. Focus your message on what you want done.
{% /callout %}

{% callout type="tip" %}
**Pop out to an editor tab.** If the sidebar feels cramped, pop the chat into a full editor tab for more room.
{% /callout %}

{% /tab %}
{% tab label="CLI" %}

{% callout type="tip" %}
**Use agents instead of modes.** Switch between agents like Code, Ask, and Plan using keybinds or slash commands. Each agent is tuned for a different type of task.
{% /callout %}

{% callout type="tip" %}
**The TUI is keyboard-driven.** Navigate, approve changes, and switch agents entirely from the keyboard — no mouse needed.
{% /callout %}

{% /tab %}
{% /tabs %}

Ready to start coding? Open the chat panel and describe what you want to build!
