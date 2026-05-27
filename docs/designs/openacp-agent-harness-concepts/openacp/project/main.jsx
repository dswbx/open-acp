// main.jsx — compose everything into the design canvas

const { useState } = React;
// Names below come from shell.jsx / tasks.jsx / plan.jsx / permissions.jsx
// — they're all on window already, so bare references resolve via global.

/* ── A realistic in-flight conversation (chat body content) ───── */
const ChatScenario = ({ showHeavyPlan = false }) => (
  <>
    <UserBubble>
      can you check if users can actually define their own formats for strings?
    </UserBubble>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <ThoughtLine>Thought for 1s</ThoughtLine>
      <ThoughtLine>
        Used <span style={{ color: "var(--text)" }}>Explore</span> format handling
      </ThoughtLine>
      <ThoughtLine>Thought for 1s</ThoughtLine>
    </div>
    <AgentText>
      Yes. Use{" "}
      <code
        style={{
          background: "var(--surface-2)",
          padding: "1px 5px",
          borderRadius: 3,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      >
        registerFormat("myformat", (input: string) =&gt; boolean)
      </code>{" "}
      from{" "}
      <code
        style={{
          background: "var(--surface-2)",
          padding: "1px 5px",
          borderRadius: 3,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      >
        jsonv-ts
      </code>
      . It's exported from the package at{" "}
      <code
        style={{
          background: "var(--surface-2)",
          padding: "1px 5px",
          borderRadius: 3,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      >
        src/lib/index.ts:61
      </code>
      . Custom formats are stored in a registry and work exactly like built-in ones.
    </AgentText>
    <UserBubble>looks good — let's also export unregisterFormat. plan it out first.</UserBubble>
  </>
);

/* ── HERO: full app with internal demo dock ───────────────────── */
const HeroScenarios = [
  { id: "idle", label: "Idle", tasks: null, plan: null, perm: null },
  { id: "running", label: "Tasks running", tasks: "active", plan: null, perm: null },
  { id: "planning", label: "Plan streaming", tasks: null, plan: "stream", perm: null },
  { id: "plan-done", label: "Plan ready", tasks: null, plan: "teaser", perm: null },
  { id: "permission", label: "Permission ask", tasks: "active", plan: null, perm: "shell" },
  { id: "file-perm", label: "File edit ask", tasks: null, plan: null, perm: "file" },
  { id: "queue", label: "Batch approval", tasks: null, plan: null, perm: "queue" },
];

const Hero = () => {
  const [scenario, setScenario] = useState("permission");
  const s = HeroScenarios.find((x) => x.id === scenario);
  const tasksNode = s.tasks ? <TasksCardCompact tasks={TASK_DATA} /> : null;
  let planNode = null;
  if (s.plan === "stream") planNode = <PlanCardStreaming />;
  else if (s.plan === "teaser") planNode = <PlanCardTeaser />;
  let permNode = null;
  if (s.perm === "shell") permNode = <PermissionShell />;
  else if (s.perm === "file") permNode = <PermissionFileEdit />;
  else if (s.perm === "mcp") permNode = <PermissionMCP />;
  else if (s.perm === "queue") permNode = <PermissionQueue />;

  return (
    <AppShell
      topbarProps={{ title: "Chat", branch: "main", diff: { add: 1, del: 1 }, file: "jsonv-ts" }}
    >
      <ChatArea
        composer={
          <Composer
            mode="plan"
            placeholder="Ask for follow-up changes"
            running={!!s.tasks || !!s.plan}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
              {tasksNode}
              {planNode}
              {permNode}
            </div>
          </Composer>
        }
      >
        <ChatScenario />
      </ChatArea>
      {/* internal demo dock (lives inside artboard) */}
      <DemoDock scenario={scenario} setScenario={setScenario} />
    </AppShell>
  );
};

const DemoDock = ({ scenario, setScenario }) => (
  <div
    style={{
      position: "absolute",
      bottom: 14,
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(20,20,24,0.95)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--border-strong)",
      borderRadius: 10,
      padding: "6px 8px",
      display: "flex",
      gap: 3,
      alignItems: "center",
      boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
      zIndex: 50,
    }}
  >
    <span
      style={{
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        color: "var(--text-faint)",
        padding: "0 8px 0 6px",
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}
    >
      State
    </span>
    {HeroScenarios.map((s) => (
      <button
        key={s.id}
        onClick={() => setScenario(s.id)}
        style={{
          padding: "5px 10px",
          borderRadius: 6,
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          background: scenario === s.id ? "var(--accent-soft)" : "transparent",
          color: scenario === s.id ? "var(--accent)" : "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {s.label}
      </button>
    ))}
  </div>
);

/* ── VARIANT FRAME — chat-only chrome for showcasing one affordance ── */
const VariantFrame = ({
  label,
  sublabel,
  children,
  composerExtra,
  planMode = false,
  taskMode = false,
}) => (
  <div className="oacp-root">
    <Topbar title="Chat" branch="main" diff={{ add: 1, del: 1 }} file="jsonv-ts" />
    <ChatArea
      composer={
        <Composer
          mode={planMode ? "plan" : "default"}
          placeholder="Ask for follow-up changes"
          running={taskMode}
        >
          {composerExtra}
        </Composer>
      }
    >
      <ChatScenario />
    </ChatArea>
  </div>
);

/* ── CANVAS ROOT ──────────────────────────────────────────────── */
// Override design-canvas card defaults for dark theme
const DARK_CARD_STYLE = {
  background: "var(--bg)",
  borderRadius: 10,
  boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 40px rgba(0,0,0,0.5)",
};

const App = () => (
  <DesignCanvas minScale={0.1} maxScale={2}>
    {/* HERO */}
    <DCSection
      id="hero"
      title="Recommended composition"
      subtitle="Floating cards stack above the composer so it stays usable while the agent works. Toggle the dock to step through states."
    >
      <DCArtboard
        id="hero"
        label="Full app · interactive demo"
        width={1480}
        height={900}
        style={DARK_CARD_STYLE}
      >
        <Hero />
      </DCArtboard>
    </DCSection>

    {/* AGENT TASKS */}
    <DCSection
      id="tasks"
      title="Agent tasks"
      subtitle="A floating checklist that lives above the composer. Three takes on density and emphasis."
    >
      <DCArtboard
        id="tasks-compact"
        label="A · Codex-style compact list"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          taskMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <TasksCardCompact tasks={TASK_DATA} />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="tasks-active"
        label="B · Active-task focus"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          taskMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <TasksCardActiveFocus
                tasks={[
                  {
                    id: 1,
                    text: "Add a provider question strategy module with unified metadata and Codex-specific bootstrap instructions",
                    state: "done",
                  },
                  {
                    id: 2,
                    text: "Wire runtime session bootstrap so provider-specific hidden instructions run once per session before chat prompts",
                    state: "active",
                  },
                  {
                    id: 3,
                    text: "Add tests for Codex strategy and bootstrap behavior, then run targeted verification",
                    state: "todo",
                  },
                ]}
              />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="tasks-timeline"
        label="C · Timeline strip"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          taskMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <TasksCardTimeline tasks={TASK_DATA} />
            </div>
          }
        />
      </DCArtboard>
    </DCSection>

    {/* PLAN */}
    <DCSection
      id="plan"
      title="Plan display"
      subtitle="Card collapsed by default, expandable. Each variant solves a different review intent."
    >
      <DCArtboard
        id="plan-stream"
        label="A · Streaming (writing plan)"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          planMode={true}
          taskMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PlanCardStreaming />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="plan-teaser"
        label="B · Codex-style teaser + Expand pill"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          planMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PlanCardTeaser />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="plan-sectioned"
        label="C · Sectioned outline (TOC tabs)"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          planMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PlanCardSectioned />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="plan-approve"
        label="D · Plan + approve/edit inline"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          planMode={true}
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PlanCardApprove />
            </div>
          }
        />
      </DCArtboard>
    </DCSection>

    {/* PERMISSIONS */}
    <DCSection
      id="perms"
      title="Permission approval"
      subtitle="Floats above the input (per your preference). The composer stays editable so you can tell open-acp what to do differently instead of just approving or denying."
    >
      <DCArtboard
        id="perm-shell"
        label="A · Shell command"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PermissionShell />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="perm-file"
        label="B · File edit with diff"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PermissionFileEdit />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="perm-mcp"
        label="C · MCP tool call"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PermissionMCP />
            </div>
          }
        />
      </DCArtboard>
      <DCArtboard
        id="perm-queue"
        label="D · Stacked batch queue"
        width={920}
        height={700}
        style={DARK_CARD_STYLE}
      >
        <VariantFrame
          composerExtra={
            <div style={{ marginBottom: 10 }}>
              <PermissionQueue />
            </div>
          }
        />
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
