# Tab vs Agent Manager Architecture: Performance Analysis

## Overview

This document analyzes the architectural differences between tab-based sessions ("Open in Tab") and Agent Manager sessions that could cause performance differences. Both use `KiloProvider` as the core webview provider, but instantiation, resource sharing, and lifecycle management differ significantly.

## 1. KiloProvider Instantiation

### Tab Sessions

Each "Open in Tab" creates a **new, independent `KiloProvider` instance** (`extension.ts:233`):

```
openKiloInNewTab() → new KiloProvider() → resolveWebviewPanel(panel)
```

Each tab instance:

- Creates its own `trackedSessionIds` Set
- Maintains its own `cachedProvidersMessage`, `cachedAgentsMessage`, `cachedSkillsMessage`, `cachedCommandsMessage`, `cachedConfigMessage`, `cachedNotificationsMessage`
- Has its own `currentSession` reference
- Creates its own `FileIgnoreController`
- Creates its own `MarketplaceService`
- Runs its own `initializeConnection()` which subscribes to SSE and fetches providers/agents/skills/config/notifications independently

### Agent Manager

The Agent Manager creates **one `KiloProvider` instance** for its entire panel (`AgentManagerProvider.ts:152`), regardless of how many sessions are managed:

```
attachPanel() → new KiloProvider(... { slimEditMetadata: true }) → attachToWebview()
```

All Agent Manager sessions (across all worktrees) share this single provider. The Agent Manager uses `attachToWebview()` instead of `resolveWebviewPanel()`, which:

- Does NOT set HTML (Agent Manager has its own HTML with `agent-manager.js`)
- Supports an `onBeforeMessage` interceptor for routing `agentManager.*` messages
- Otherwise identical initialization (SSE subscription, API fetches)

### Sidebar

One `KiloProvider` instance created at activation (`extension.ts:39`), registered as a `WebviewViewProvider`.

### Performance Impact

Opening N tabs creates N `KiloProvider` instances, each independently:

1. Calling `connectionService.connect()` (no-op after first, but still invoked)
2. Subscribing a **new SSE event listener** to the connection service
3. Subscribing a **new state change listener**
4. Subscribing a **new notification dismiss listener**
5. Making 6 parallel HTTP requests: `fetchAndSendProviders()`, `fetchAndSendAgents()`, `fetchAndSendSkills()`, `fetchAndSendCommands()`, `fetchAndSendConfig()`, `fetchAndSendNotifications()`

With 5 open tabs, that's 30 HTTP requests at initialization and 5 SSE event listeners all firing for every event.

## 2. Webview Lifecycle

### Tab Sessions

- Created via `vscode.window.createWebviewPanel()` with `retainContextWhenHidden: true`
- Each tab gets its own webview process (Chromium renderer)
- Each loads `webview.js` + `webview.css` independently
- Each instantiates the full SolidJS provider tree: `ThemeProvider → DialogProvider → VSCodeProvider → ServerProvider → LanguageBridge → MarkedProvider → ... → SessionProvider → DataBridge → AppContent`
- Disposal: `panel.onDidDispose` calls `tabProvider.dispose()` which cleans up SSE/state subscriptions

### Agent Manager

- Single `WebviewPanel` with `retainContextWhenHidden: true`
- Loads `agent-manager.js` + `agent-manager.css` (separate build entry)
- The Agent Manager webview **reuses the same provider chain** (`VSCodeProvider → ServerProvider → ProviderProvider → ConfigProvider → SessionProvider`) but wraps content in `WorktreeModeProvider` for worktree context
- Single `ChatView` component renders the active session; switching sessions swaps data, not DOM trees
- Disposal: stops stats poller, stops diff polling, disposes the single KiloProvider

### Sidebar

- `WebviewView` (not `WebviewPanel`) with `retainContextWhenHidden: true`
- Shares the same `webview.js` bundle as tabs
- Survives sidebar panel switches without re-creating

### Performance Impact

**DOM/Memory**: Each tab creates an independent Chromium renderer process with its own JavaScript heap, DOM tree, and SolidJS reactive graph. The Agent Manager uses one renderer for all sessions.

**Context initialization**: Each tab's SolidJS `SessionProvider` independently:

- Initializes a fresh session store with `createStore`
- Sets up message handlers for 20+ message types
- Creates retry timers for providers/agents/config
- Builds memos for session filtering, status computation, cost calculation

The Agent Manager's single `SessionProvider` handles all sessions in one reactive graph.

## 3. Resource Sharing

### Shared (Good)

| Resource           | Sharing                     | Location                |
| ------------------ | --------------------------- | ----------------------- |
| CLI server process | Single `kilo serve` process | `ServerManager`         |
| SDK client         | Single `KiloClient`         | `KiloConnectionService` |
| SSE stream         | Single `SdkSSEAdapter`      | `KiloConnectionService` |
| Health polling     | Single 10s interval         | `KiloConnectionService` |
| Telemetry proxy    | Singleton                   | `TelemetryProxy`        |

### Duplicated Per Tab (Potentially Wasteful)

| Resource                      | Per-Tab Cost                        | Notes                                                                                   |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| SSE event listener            | O(events) filter calls per listener | Every SSE event fans out to all listeners; each runs its own `trackedSessionIds` filter |
| State change listener         | O(transitions) per listener         | Fires on every connect/disconnect                                                       |
| Notification dismiss listener | 1 per tab                           | Minor                                                                                   |
| Cached message objects        | ~6 objects per tab                  | `cachedProvidersMessage`, `cachedAgentsMessage`, etc. — identical data cached N times   |
| HTTP initialization requests  | 6 per tab                           | providers, agents, skills, commands, config, notifications — all return same data       |
| `FileIgnoreController`        | 1 per tab (lazy)                    | Reads `.kilocodeignore` from disk                                                       |
| `MarketplaceService`          | 1 per tab (lazy)                    | Minor                                                                                   |
| `webviewMessageDisposable`    | 1 per tab                           | VS Code event listener                                                                  |
| SolidJS reactive graph        | Full store per tab                  | `SessionStore` with sessions, messages, parts, todos, modelSelections                   |
| `DataBridge` memo             | 1 per tab                           | Recomputes on every session/message change                                              |

### Agent Manager's Efficiency

The Agent Manager registers all worktree session IDs on a **single** KiloProvider via `trackSession()` and `setSessionDirectory()`. This means:

- One SSE listener handles events for ALL managed sessions
- One set of cached messages serves all sessions
- One `initializeConnection()` call

## 4. Streaming / Rendering

### SSE Event Flow (Both)

```
CLI server → SdkSSEAdapter → KiloConnectionService.eventListeners
  → [per KiloProvider] handleEvent() → mapSSEEventToWebviewMessage()
  → webview.postMessage() → window message event
  → SolidJS context handler → store update → reactive render
```

### Per-Token Streaming

For `message.part.delta` events (character-by-character streaming):

1. **Extension side**: Each `KiloProvider.handleEvent()` runs filtering (`isEventFromForeignProject`, `trackedSessionIds.has`), maps the event, calls `slimPart()`, then `postMessage()`.

2. **Webview side**: `handlePartUpdated()` in `session.tsx:669` appends text deltas via `produce()`:
   ```ts
   ;(parts[messageID][existingIndex] as { text: string }).text += delta.textDelta
   ```

With N tabs open, a single streaming token causes:

- N filter checks in the connection service's `onEventFiltered` wrapper
- N `handleEvent()` calls (though only the tab tracking that session passes the filter)
- 1 `postMessage()` to the relevant tab's webview
- 1 SolidJS store update in that tab

**The filtering overhead is minimal** — each non-matching tab exits early at `trackedSessionIds.has()`. The real cost is the per-event function call overhead across N listeners.

### Agent Manager Streaming

The Agent Manager has **one** SSE listener that handles events for all managed sessions. The `trackedSessionIds` set contains all worktree session IDs, so events route to the single webview where SolidJS updates the correct session's store entry.

**Key optimization in Agent Manager**: `slimEditMetadata: true` is explicitly passed (`AgentManagerProvider.ts:153`), which strips multi-MB `filediff.before/after` strings from edit tool parts. Tab sessions also default to `slimEditMetadata: true` since `KiloProvider.ts:109` sets `this.slimEditMetadata = options?.slimEditMetadata ?? true`.

### Note on Event Coalescing

The `SdkSSEAdapter` comments note (line 23-27):

> The app batches rapid events into 16ms windows before flushing to the UI. We don't do that here because `postMessage()` to the webview already acts as an implicit async buffer. If profiling shows the webview is overwhelmed by high-frequency events, adding a similar coalescing queue here would be a straightforward improvement.

This means during heavy streaming, each token fires an individual `postMessage()`. The webview's SolidJS `produce()` call on the store triggers synchronous reactive updates for each delta. If multiple sessions are streaming simultaneously in the Agent Manager, all deltas flow through a single webview — potentially benefiting from SolidJS's batching within a single event loop tick.

## 5. Memory and Event Listeners

### Event Listener Accumulation

Each `KiloProvider` registers 3 listeners on `KiloConnectionService`:

- `onEventFiltered()` → adds to `eventListeners: Set<SSEEventListener>`
- `onStateChange()` → adds to `stateListeners: Set<StateListener>`
- `onNotificationDismissed()` → adds to `notificationDismissListeners: Set<NotificationDismissListener>`

These are properly cleaned up in `KiloProvider.dispose()` which calls the unsubscribe functions stored in `unsubscribeEvent`, `unsubscribeState`, `unsubscribeNotificationDismiss`. Tab disposal at `extension.ts:244` calls `tabProvider.dispose()`.

### Potential Leak: Re-initialization

`initializeConnection()` guards against concurrent calls via `initConnectionPromise`, and cleans up existing subscriptions before re-subscribing:

```ts
this.unsubscribeEvent?.()
this.unsubscribeState?.()
this.unsubscribeNotificationDismiss?.()
```

This pattern is correct — no listener leaks on re-connection.

### Webview Message Listeners

Each `setupWebviewMessageHandler()` call disposes the previous handler first:

```ts
this.webviewMessageDisposable?.dispose()
this.webviewMessageDisposable = webview.onDidReceiveMessage(...)
```

This prevents accumulation of message handlers.

### SolidJS Memory (Webview Side)

Each tab's webview creates independent SolidJS stores:

- `SessionStore` with `sessions`, `messages`, `parts`, `todos` records
- Signal arrays for `permissions`, `questions`
- Computed memos for `status`, `statusText`, `totalCost`, `contextUsage`
- Multiple `createEffect` subscriptions for retry logic

The Agent Manager's single webview holds one `SessionStore` that tracks ALL managed sessions. This is more memory-efficient for N sessions than N separate stores each with a partial view.

### `retainContextWhenHidden: true`

All panels use this option, meaning webviews stay alive in memory even when not visible. A user with 5 tabs open has 5 live Chromium renderers, each with a full SolidJS app, even if only one tab is visible.

## Summary of Performance Differences

| Factor                    | Tabs (N open)            | Agent Manager           | Impact                                           |
| ------------------------- | ------------------------ | ----------------------- | ------------------------------------------------ |
| KiloProvider instances    | N                        | 1                       | N× SSE listeners, N× init HTTP requests          |
| Chromium renderers        | N                        | 1                       | N× memory for JS heap, DOM                       |
| SSE event filtering       | N filter calls per event | 1 filter call per event | Minor CPU per event                              |
| Init HTTP requests        | 6×N                      | 6                       | Burst load on startup                            |
| Cached message copies     | N                        | 1                       | Minor memory                                     |
| SolidJS stores            | N independent stores     | 1 shared store          | N× reactive graph overhead                       |
| `retainContextWhenHidden` | N live renderers         | 1 live renderer         | N× background memory                             |
| Session switching         | Load messages per switch | Data already in store   | Agent Manager faster for multi-session workflows |

## Recommendations

1. **Event coalescing**: Consider implementing the 16ms batching window mentioned in `SdkSSEAdapter` comments, especially for tabs that may receive high-frequency streaming events.

2. **Shared cache layer**: Tab-created `KiloProvider` instances could share cached provider/agent/config data from the connection service instead of each fetching independently.

3. **Lazy webview initialization**: Tabs not currently visible could defer `initializeConnection()` until they become active (using `panel.onDidChangeViewState`).

4. **Tab pooling / virtualization**: Consider a tab architecture where inactive tabs release their webview and re-create on focus, trading initialization latency for memory savings.

5. **Shared session store**: A centralized session store at the extension level (similar to how `KiloConnectionService` centralizes the server connection) could eliminate duplicate HTTP requests for session data.
