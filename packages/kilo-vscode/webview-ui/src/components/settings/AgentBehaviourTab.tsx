import { Component, createSignal, createMemo, createEffect, For, Show } from "solid-js"
import { Select } from "@kilocode/kilo-ui/select"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import type { AgentConfig, AgentInfo, CustomModeConfig, SkillInfo } from "../../types/messages"

type SubtabId = "agents" | "mcpServers" | "rules" | "workflows" | "skills"

interface SubtabConfig {
  id: SubtabId
  labelKey: string
}

const subtabs: SubtabConfig[] = [
  { id: "agents", labelKey: "settings.agentBehaviour.subtab.agents" },
  { id: "mcpServers", labelKey: "settings.agentBehaviour.subtab.mcpServers" },
  { id: "rules", labelKey: "settings.agentBehaviour.subtab.rules" },
  { id: "workflows", labelKey: "settings.agentBehaviour.subtab.workflows" },
  { id: "skills", labelKey: "settings.agentBehaviour.subtab.skills" },
]

interface SelectOption {
  value: string
  label: string
}

import SettingsRow from "./SettingsRow"

const Placeholder: Component<{ text: string }> = (props) => (
  <Card>
    <p
      style={{
        "font-size": "12px",
        color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
        margin: 0,
        "line-height": "1.5",
      }}
    >
      <strong>{useLanguage().t("settings.agentBehaviour.notImplemented")}</strong> {props.text}
    </p>
  </Card>
)

const AgentBehaviourTab: Component = () => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const dialog = useDialog()
  const [activeSubtab, setActiveSubtab] = createSignal<SubtabId>("agents")
  const [selectedAgent, setSelectedAgent] = createSignal<string>("")
  const [newSkillPath, setNewSkillPath] = createSignal("")
  const [newSkillUrl, setNewSkillUrl] = createSignal("")
  const [newInstruction, setNewInstruction] = createSignal("")

  // Custom mode create/edit state
  const [editing, setEditing] = createSignal<string | null>(null) // name of mode being edited, or null
  const [creating, setCreating] = createSignal(false)
  const [modeName, setModeName] = createSignal("")
  const [modeDescription, setModeDescription] = createSignal("")
  const [modePrompt, setModePrompt] = createSignal("")
  const [nameError, setNameError] = createSignal<string | null>(null)

  const NAME_PATTERN = /^[a-z][a-z0-9-]*$/

  const validateName = (name: string): string | null => {
    if (!name.trim()) return language.t("settings.agentBehaviour.modeNameRequired")
    if (!NAME_PATTERN.test(name)) return language.t("settings.agentBehaviour.modeNameInvalid")
    if (creating() && session.agents().some((a) => a.name === name)) {
      return language.t("settings.agentBehaviour.modeNameExists")
    }
    return null
  }

  const startCreate = () => {
    setEditing(null)
    setCreating(true)
    setModeName("")
    setModeDescription("")
    setModePrompt("")
    setNameError(null)
  }

  const startEdit = (agent: AgentInfo) => {
    setCreating(false)
    setEditing(agent.name)
    setModeName(agent.name)
    setModeDescription(agent.description ?? "")
    const cfg = config().agent?.[agent.name]
    setModePrompt(cfg?.prompt ?? "")
    setNameError(null)
  }

  const cancelEdit = () => {
    setEditing(null)
    setCreating(false)
    setNameError(null)
  }

  const handleSave = () => {
    const name = modeName().trim()
    const error = validateName(name)
    if (error) {
      setNameError(error)
      return
    }
    const cfg: CustomModeConfig = {
      description: modeDescription().trim() || undefined,
      prompt: modePrompt().trim() || undefined,
      mode: "primary",
    }
    session.saveMode(name, cfg)
    setEditing(null)
    setCreating(false)
    setNameError(null)
  }

  // Fetch skills whenever the skills subtab becomes active
  createEffect(() => {
    if (activeSubtab() === "skills") {
      session.refreshSkills()
    }
  })

  const agentNames = createMemo(() => {
    const names = session.agents().map((a) => a.name)
    // Also include any agents from config that might not be in the agent list
    const configAgents = Object.keys(config().agent ?? {})
    for (const name of configAgents) {
      if (!names.includes(name)) {
        names.push(name)
      }
    }
    return names.sort()
  })

  const defaultAgentOptions = createMemo<SelectOption[]>(() => [
    { value: "", label: language.t("common.default") },
    ...agentNames().map((name) => ({ value: name, label: name })),
  ])

  const agentSelectorOptions = createMemo<SelectOption[]>(() => [
    { value: "", label: language.t("settings.agentBehaviour.selectAgent") },
    ...agentNames().map((name) => ({ value: name, label: name })),
  ])

  const currentAgentConfig = createMemo<AgentConfig>(() => {
    const name = selectedAgent()
    if (!name) {
      return {}
    }
    return config().agent?.[name] ?? {}
  })

  const updateAgentConfig = (name: string, partial: Partial<AgentConfig>) => {
    const existing = config().agent ?? {}
    const current = existing[name] ?? {}
    updateConfig({
      agent: {
        ...existing,
        [name]: { ...current, ...partial },
      },
    })
  }

  const instructions = () => config().instructions ?? []

  const addInstruction = () => {
    const value = newInstruction().trim()
    if (!value) {
      return
    }
    const current = [...instructions()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ instructions: current })
    }
    setNewInstruction("")
  }

  const removeInstruction = (index: number) => {
    const current = [...instructions()]
    current.splice(index, 1)
    updateConfig({ instructions: current })
  }

  const skillPaths = () => config().skills?.paths ?? []
  const skillUrls = () => config().skills?.urls ?? []

  const addSkillPath = () => {
    const value = newSkillPath().trim()
    if (!value) {
      return
    }
    const current = [...skillPaths()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ skills: { ...config().skills, paths: current } })
    }
    setNewSkillPath("")
  }

  const removeSkillPath = (index: number) => {
    const current = [...skillPaths()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, paths: current } })
  }

  const addSkillUrl = () => {
    const value = newSkillUrl().trim()
    if (!value) {
      return
    }
    const current = [...skillUrls()]
    if (!current.includes(value)) {
      current.push(value)
      updateConfig({ skills: { ...config().skills, urls: current } })
    }
    setNewSkillUrl("")
  }

  const removeSkillUrl = (index: number) => {
    const current = [...skillUrls()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, urls: current } })
  }

  const confirmRemoveSkill = (skill: SkillInfo) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeSkill.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeSkill.confirm", { name: skill.name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                session.removeSkill(skill.location)
                dialog.close()
              }}
            >
              {language.t("settings.agentBehaviour.removeSkill.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const removableModes = createMemo(() => session.agents().filter((a) => !a.native))

  const confirmRemoveMode = (agent: AgentInfo) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.removeMode.title")} fit>
        <div class="dialog-confirm-body">
          <span>{language.t("settings.agentBehaviour.removeMode.confirm", { name: agent.name })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => {
                dialog.close()
                // Delay optimistic removal until after dialog close animation (100ms)
                // to prevent the reactive list re-render from firing click handlers
                // on shifted list items while the dialog overlay is still present.
                setTimeout(() => session.removeMode(agent.name), 150)
              }}
            >
              {language.t("settings.agentBehaviour.removeMode.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const renderAgentsSubtab = () => (
    <div>
      {/* Default agent */}
      <Card style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.agentBehaviour.defaultAgent.title")}
          description={language.t("settings.agentBehaviour.defaultAgent.description")}
          last
        >
          <Select
            options={defaultAgentOptions()}
            current={defaultAgentOptions().find((o) => o.value === (config().default_agent ?? ""))}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(o) => {
              if (!o) return
              const next = o.value || undefined
              if (next === (config().default_agent ?? undefined)) return
              updateConfig({ default_agent: next })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>
      </Card>

      {/* Available agents list */}
      <hr
        style={{
          border: "none",
          "border-top": "1px solid var(--border-weak-base)",
          margin: "16px 0",
        }}
      />
      <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
        {language.t("settings.agentBehaviour.availableAgents")}
      </div>
      <Card style={{ "margin-bottom": "12px" }}>
        <For each={agentNames()}>
          {(name, index) => {
            const agent = () => session.agents().find((a) => a.name === name)
            return (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "8px 4px",
                  "border-bottom": index() < agentNames().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                  "border-radius": "4px",
                }}
              >
                <div>
                  <div style={{ "font-weight": "500", "font-size": "13px" }}>{name}</div>
                  <Show when={agent()?.description}>
                    <div
                      style={{
                        "font-size": "11px",
                        color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                        "margin-top": "2px",
                      }}
                    >
                      {agent()!.description}
                    </div>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>
      </Card>

      <Show when={selectedAgent()}>
        <Card>
          {/* Model override */}
          <SettingsRow
            title={language.t("settings.agentBehaviour.modelOverride.title")}
            description={language.t("settings.agentBehaviour.modelOverride.description")}
          >
            <TextField
              value={currentAgentConfig().model ?? ""}
              placeholder="e.g. anthropic/claude-sonnet-4-20250514"
              onChange={(val) =>
                updateAgentConfig(selectedAgent(), {
                  model: val.trim() || undefined,
                })
              }
            />
          </SettingsRow>

          {/* System prompt */}
          <SettingsRow
            title={language.t("settings.agentBehaviour.prompt.title")}
            description={language.t("settings.agentBehaviour.prompt.description")}
          >
            <TextField
              value={currentAgentConfig().prompt ?? ""}
              placeholder="Custom instructions…"
              multiline
              onChange={(val) =>
                updateAgentConfig(selectedAgent(), {
                  prompt: val.trim() || undefined,
                })
              }
            />
          </SettingsRow>

          {/* Temperature */}
          <SettingsRow
            title={language.t("settings.agentBehaviour.temperature.title")}
            description={language.t("settings.agentBehaviour.temperature.description")}
          >
            <TextField
              value={currentAgentConfig().temperature?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseFloat(val)
                updateAgentConfig(selectedAgent(), { temperature: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>

          {/* Top-p */}
          <SettingsRow
            title={language.t("settings.agentBehaviour.topP.title")}
            description={language.t("settings.agentBehaviour.topP.description")}
          >
            <TextField
              value={currentAgentConfig().top_p?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseFloat(val)
                updateAgentConfig(selectedAgent(), { top_p: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>

          {/* Max steps */}
          <SettingsRow
            title={language.t("settings.agentBehaviour.maxSteps.title")}
            description={language.t("settings.agentBehaviour.maxSteps.description")}
            last
          >
            <TextField
              value={currentAgentConfig().steps?.toString() ?? ""}
              placeholder={language.t("common.default")}
              onChange={(val) => {
                const parsed = parseInt(val, 10)
                updateAgentConfig(selectedAgent(), { steps: isNaN(parsed) ? undefined : parsed })
              }}
            />
          </SettingsRow>
        </Card>
      </Show>

      {/* Custom modes section */}
      <hr
        style={{
          border: "none",
          "border-top": "1px solid var(--border-weak-base)",
          margin: "16px 0",
        }}
      />
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "8px",
        }}
      >
        <div data-slot="settings-row-label-title">{language.t("settings.agentBehaviour.availableModes")}</div>
        <Button variant="secondary" size="small" onClick={startCreate}>
          {language.t("settings.agentBehaviour.createMode")}
        </Button>
      </div>

      {/* Create mode form */}
      <Show when={creating()}>
        <Card style={{ "margin-bottom": "12px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.modeName")}
            description={language.t("settings.agentBehaviour.modeName.description")}
          >
            <TextField
              value={modeName()}
              placeholder={language.t("settings.agentBehaviour.modeName.placeholder")}
              onChange={(val) => {
                setModeName(val)
                setNameError(null)
              }}
            />
          </SettingsRow>
          <Show when={nameError()}>
            <div
              style={{
                color: "var(--vscode-errorForeground, #f44)",
                "font-size": "12px",
                "margin-bottom": "8px",
                "margin-top": "-4px",
              }}
            >
              {nameError()}
            </div>
          </Show>
          <SettingsRow
            title={language.t("settings.agentBehaviour.modeDescription")}
            description={language.t("settings.agentBehaviour.modeDescription.description")}
          >
            <TextField
              value={modeDescription()}
              placeholder={language.t("settings.agentBehaviour.modeDescription.placeholder")}
              onChange={(val) => setModeDescription(val)}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.agentBehaviour.modePrompt")}
            description={language.t("settings.agentBehaviour.modePrompt.description")}
            last
          >
            <TextField
              value={modePrompt()}
              placeholder={language.t("settings.agentBehaviour.modePrompt.placeholder")}
              multiline
              onChange={(val) => setModePrompt(val)}
            />
          </SettingsRow>
          <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end", "margin-top": "8px" }}>
            <Button variant="ghost" size="small" onClick={cancelEdit}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="small" onClick={handleSave}>
              {language.t("settings.agentBehaviour.modeCreate")}
            </Button>
          </div>
        </Card>
      </Show>

      {/* Existing custom modes list */}
      <Show
        when={removableModes().length > 0}
        fallback={
          <Show when={!creating()}>
            <Card>
              <div
                style={{
                  "font-size": "12px",
                  color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                }}
              >
                {language.t("settings.agentBehaviour.noModesFound")}
              </div>
            </Card>
          </Show>
        }
      >
        <Card>
          <For each={removableModes()}>
            {(agent, index) => (
              <div
                style={{
                  padding: "8px 0",
                  "border-bottom": index() < removableModes().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <Show
                  when={editing() === agent.name}
                  fallback={
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "space-between",
                      }}
                    >
                      <div style={{ flex: 1, "min-width": 0 }}>
                        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
                          {agent.name}
                        </div>
                        <Show when={agent.description}>
                          <div data-slot="settings-row-label-subtitle" style={{ "margin-top": "4px" }}>
                            {agent.description}
                          </div>
                        </Show>
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <IconButton
                          size="small"
                          variant="ghost"
                          icon="edit"
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation()
                            startEdit(agent)
                          }}
                        />
                        <IconButton
                          size="small"
                          variant="ghost"
                          icon="close"
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation()
                            confirmRemoveMode(agent)
                          }}
                        />
                      </div>
                    </div>
                  }
                >
                  {/* Inline edit form */}
                  <div>
                    <SettingsRow
                      title={language.t("settings.agentBehaviour.modeDescription")}
                      description={language.t("settings.agentBehaviour.modeDescription.description")}
                    >
                      <TextField
                        value={modeDescription()}
                        placeholder={language.t("settings.agentBehaviour.modeDescription.placeholder")}
                        onChange={(val) => setModeDescription(val)}
                      />
                    </SettingsRow>
                    <SettingsRow
                      title={language.t("settings.agentBehaviour.modePrompt")}
                      description={language.t("settings.agentBehaviour.modePrompt.description")}
                      last
                    >
                      <TextField
                        value={modePrompt()}
                        placeholder={language.t("settings.agentBehaviour.modePrompt.placeholder")}
                        multiline
                        onChange={(val) => setModePrompt(val)}
                      />
                    </SettingsRow>
                    <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end", "margin-top": "8px" }}>
                      <Button variant="ghost" size="small" onClick={cancelEdit}>
                        {language.t("common.cancel")}
                      </Button>
                      <Button variant="primary" size="small" onClick={handleSave}>
                        {language.t("settings.agentBehaviour.modeSave")}
                      </Button>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </Card>
      </Show>
    </div>
  )

  const renderMcpSubtab = () => {
    const mcpEntries = createMemo(() => Object.entries(config().mcp ?? {}))

    return (
      <div>
        <Show
          when={mcpEntries().length > 0}
          fallback={
            <Card>
              <div
                style={{
                  "font-size": "12px",
                  color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                }}
              >
                {language.t("settings.agentBehaviour.mcpEmpty")}
              </div>
            </Card>
          }
        >
          <Card>
            <For each={mcpEntries()}>
              {([name, mcp], index) => (
                <div
                  style={{
                    padding: "8px 0",
                    "border-bottom": index() < mcpEntries().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                  }}
                >
                  <div style={{ "font-weight": "500" }}>{name}</div>
                  <div
                    style={{
                      "font-size": "12px",
                      color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                      "margin-top": "4px",
                      "font-family": "var(--vscode-editor-font-family, monospace)",
                    }}
                  >
                    <Show when={mcp.command}>
                      <div>
                        command:{" "}
                        {Array.isArray(mcp.command)
                          ? mcp.command.join(" ")
                          : `${mcp.command} ${(mcp.args ?? []).join(" ")}`}
                      </div>
                    </Show>
                    <Show when={mcp.url}>
                      <div>url: {mcp.url}</div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Card>
        </Show>
      </div>
    )
  }

  const renderSkillsSubtab = () => (
    <div>
      {/* Discovered skills */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>
        {language.t("settings.agentBehaviour.discoveredSkills")}
      </h4>
      <Show
        when={session.skills().length > 0}
        fallback={
          <Card style={{ "margin-bottom": "16px" }}>
            <div data-slot="settings-row-label-subtitle">{language.t("settings.agentBehaviour.noSkillsFound")}</div>
          </Card>
        }
      >
        <Card style={{ "margin-bottom": "16px" }}>
          <For each={session.skills()}>
            {(skill, index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "8px 0",
                  "border-bottom": index() < session.skills().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
                    {skill.name}
                  </div>
                  <div
                    data-slot="settings-row-label-subtitle"
                    style={{
                      "margin-top": "4px",
                      "font-family": "var(--vscode-editor-font-family, monospace)",
                    }}
                  >
                    <div>{skill.description}</div>
                    <div>{skill.location}</div>
                  </div>
                </div>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => confirmRemoveSkill(skill)} />
              </div>
            )}
          </For>
        </Card>
      </Show>

      {/* Skill paths */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>{language.t("settings.agentBehaviour.skillPaths")}</h4>
      <Card style={{ "margin-bottom": "16px" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": skillPaths().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newSkillPath()}
              placeholder="e.g. ./skills"
              onChange={(val) => setNewSkillPath(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addSkillPath()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addSkillPath}>
            {language.t("common.add")}
          </Button>
        </div>
        <For each={skillPaths()}>
          {(path, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < skillPaths().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {path}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillPath(index())} />
            </div>
          )}
        </For>
      </Card>

      {/* Skill URLs */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>{language.t("settings.agentBehaviour.skillUrls")}</h4>
      <Card>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": skillUrls().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newSkillUrl()}
              placeholder="e.g. https://example.com/skills"
              onChange={(val) => setNewSkillUrl(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addSkillUrl()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addSkillUrl}>
            {language.t("common.add")}
          </Button>
        </div>
        <For each={skillUrls()}>
          {(url, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < skillUrls().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {url}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillUrl(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )

  const renderRulesSubtab = () => (
    <div>
      <Card>
        <div
          style={{
            "padding-bottom": "8px",
            "border-bottom": "1px solid var(--border-weak-base)",
          }}
        >
          <div style={{ "font-weight": "500" }}>{language.t("settings.agentBehaviour.instructionFiles")}</div>
          <div
            style={{
              "font-size": "12px",
              color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              "margin-top": "2px",
            }}
          >
            {language.t("settings.agentBehaviour.instructionFiles.description")}
          </div>
        </div>

        {/* Add new instruction path */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "8px 0",
            "border-bottom": instructions().length > 0 ? "1px solid var(--border-weak-base)" : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={newInstruction()}
              placeholder="e.g. ./INSTRUCTIONS.md"
              onChange={(val) => setNewInstruction(val)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") addInstruction()
              }}
            />
          </div>
          <Button variant="secondary" onClick={addInstruction}>
            {language.t("common.add")}
          </Button>
        </div>

        {/* Instructions list */}
        <For each={instructions()}>
          {(path, index) => (
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 0",
                "border-bottom": index() < instructions().length - 1 ? "1px solid var(--border-weak-base)" : "none",
              }}
            >
              <span
                style={{
                  "font-family": "var(--vscode-editor-font-family, monospace)",
                  "font-size": "12px",
                }}
              >
                {path}
              </span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeInstruction(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )

  const renderSubtabContent = () => {
    switch (activeSubtab()) {
      case "agents":
        return renderAgentsSubtab()
      case "mcpServers":
        return renderMcpSubtab()
      case "rules":
        return renderRulesSubtab()
      case "workflows":
        return <Placeholder text={language.t("settings.agentBehaviour.workflowsPlaceholder")} />
      case "skills":
        return renderSkillsSubtab()
      default:
        return null
    }
  }

  return (
    <div>
      {/* Horizontal subtab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          "border-bottom": "1px solid var(--vscode-panel-border)",
          "margin-bottom": "16px",
        }}
      >
        <For each={subtabs}>
          {(subtab) => (
            <button
              onClick={() => setActiveSubtab(subtab.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                background: "transparent",
                color:
                  activeSubtab() === subtab.id ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)",
                "font-size": "13px",
                "font-family": "var(--vscode-font-family)",
                cursor: "pointer",
                "border-bottom":
                  activeSubtab() === subtab.id ? "2px solid var(--vscode-foreground)" : "2px solid transparent",
                "margin-bottom": "-1px",
              }}
              onMouseEnter={(e) => {
                if (activeSubtab() !== subtab.id) {
                  e.currentTarget.style.color = "var(--vscode-foreground)"
                }
              }}
              onMouseLeave={(e) => {
                if (activeSubtab() !== subtab.id) {
                  e.currentTarget.style.color = "var(--vscode-descriptionForeground)"
                }
              }}
            >
              {language.t(subtab.labelKey)}
            </button>
          )}
        </For>
      </div>

      {/* Subtab content */}
      {renderSubtabContent()}
    </div>
  )
}

export default AgentBehaviourTab
