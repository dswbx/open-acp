// tasks.jsx — Agent Tasks card variants
// Three concepts for displaying tasks/checklist that floats above the input.

const TASK_DATA = [
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
];

/* ── Variant A — Codex-style compact list (collapsed header → expanded list) */
const TasksCardCompact = ({ tasks = TASK_DATA, collapsed: initCollapsed = false }) => {
  const [collapsed, setCollapsed] = React.useState(initCollapsed);
  const done = tasks.filter((t) => t.state === "done").length;
  return (
    <div
      className="oacp-mono"
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: collapsed ? "10px 14px" : "12px 14px 14px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text)" }}>
        <window.Icon.Tasks />
        <span style={{ fontSize: 13 }}>
          {done} of {tasks.length} tasks completed
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          <window.Icon.ChevronExpand open={!collapsed} />
        </button>
      </div>
      {!collapsed && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingLeft: 2,
          }}
        >
          {tasks.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  marginTop: 1,
                  borderRadius: 7,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: t.state === "done" ? "var(--ok-soft)" : "transparent",
                  border:
                    t.state === "done"
                      ? "none"
                      : `1px solid ${t.state === "active" ? "var(--accent)" : "var(--text-faint)"}`,
                  color: t.state === "done" ? "oklch(0.82 0.13 150)" : "transparent",
                }}
              >
                {t.state === "done" && <window.Icon.Check />}
                {t.state === "active" && (
                  <span
                    className="oacp-spinner"
                    style={{ width: 8, height: 8, borderWidth: 1.2, color: "var(--accent)" }}
                  />
                )}
              </div>
              <span
                style={{
                  color:
                    t.state === "done"
                      ? "var(--text-muted)"
                      : t.state === "todo"
                        ? "var(--text-dim)"
                        : "var(--text)",
                  textDecoration: t.state === "done" ? "line-through" : "none",
                  textDecorationColor: "var(--text-faint)",
                }}
              >
                <span style={{ color: "var(--text-faint)", marginRight: 6 }}>{i + 1}.</span>
                {t.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Variant B — Active-task focus (hero treatment for current task) */
const TasksCardActiveFocus = ({ tasks = TASK_DATA }) => {
  const done = tasks.filter((t) => t.state === "done");
  const active = tasks.find((t) => t.state === "active");
  const todo = tasks.filter((t) => t.state === "todo");
  const total = tasks.length;
  const completed = done.length;
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        overflow: "hidden",
        animation: "oacp-fade-in .25s",
      }}
    >
      {/* progress strip */}
      <div style={{ height: 2, background: "var(--surface-1)" }}>
        <div
          style={{
            height: "100%",
            width: `${(completed / total) * 100}%`,
            background: "var(--accent)",
            transition: "width .3s",
          }}
        />
      </div>
      <div style={{ padding: "12px 14px" }}>
        {/* completed pills */}
        {done.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: active ? 10 : 0 }}>
            {done.map((t, i) => (
              <span key={t.id} className="oacp-chip" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: "oklch(0.82 0.13 150)", display: "flex" }}>
                  <window.Icon.Check />
                </span>
                Task {tasks.indexOf(t) + 1}
              </span>
            ))}
          </div>
        )}
        {/* active task — hero */}
        {active && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 12px",
              background: "var(--surface-1)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="oacp-spinner"
              style={{ width: 14, height: 14, marginTop: 2, color: "var(--accent)" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Task {tasks.indexOf(active) + 1} of {total}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>· 28s elapsed</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--text)" }}>
                {active.text}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--accent)",
                    animation: "oacp-pulse 1.2s infinite",
                  }}
                />
                Editing <span style={{ color: "var(--text)" }}>src/runtime/session.ts</span>
              </div>
            </div>
          </div>
        )}
        {/* upcoming */}
        {todo.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Up next
            </div>
            {todo.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "4px 0",
                  fontSize: 13,
                  color: "var(--text-dim)",
                }}
              >
                <span style={{ color: "var(--text-faint)" }}>{tasks.indexOf(t) + 1}.</span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Variant C — Horizontal timeline strip (mini status bar) */
const TasksCardTimeline = ({ tasks = TASK_DATA }) => {
  const [hover, setHover] = React.useState(null);
  const active = tasks.find((t) => t.state === "active");
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "10px 14px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            flexShrink: 0,
          }}
        >
          Plan
        </span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
          {tasks.map((t, i) => {
            const isLast = i === tasks.length - 1;
            return (
              <React.Fragment key={t.id}>
                <div
                  onMouseEnter={() => setHover(t.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      t.state === "done"
                        ? "var(--ok-soft)"
                        : t.state === "active"
                          ? "var(--accent-soft)"
                          : "var(--surface-1)",
                    border: `1.5px solid ${t.state === "done" ? "oklch(0.78 0.10 150)" : t.state === "active" ? "var(--accent)" : "var(--border-strong)"}`,
                    color: t.state === "done" ? "oklch(0.82 0.13 150)" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {t.state === "done" ? (
                    <window.Icon.Check />
                  ) : t.state === "active" ? (
                    <span
                      className="oacp-spinner"
                      style={{ width: 9, height: 9, borderWidth: 1.2, color: "var(--accent)" }}
                    />
                  ) : (
                    i + 1
                  )}
                  {hover === t.id && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 8px)",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "var(--bg)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 6,
                        padding: "7px 10px",
                        fontFamily: "var(--font-sans)",
                        fontWeight: 400,
                        fontSize: 12,
                        width: 240,
                        color: "var(--text)",
                        whiteSpace: "normal",
                        textAlign: "left",
                        lineHeight: 1.4,
                        zIndex: 5,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginBottom: 3,
                        }}
                      >
                        Task {i + 1} · {t.state}
                      </div>
                      {t.text}
                    </div>
                  )}
                </div>
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      height: 1.5,
                      background:
                        tasks[i + 1].state !== "todo"
                          ? "oklch(0.78 0.10 150)"
                          : "var(--border-strong)",
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <button
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Expand <window.Icon.ChevronExpand open={false} />
        </button>
      </div>
      {active && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
            fontSize: 12.5,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            className="oacp-spinner"
            style={{ width: 10, height: 10, borderWidth: 1.2, color: "var(--accent)" }}
          />
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--text)",
            }}
          >
            {active.text}
          </span>
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}
          >
            0:28
          </span>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { TasksCardCompact, TasksCardActiveFocus, TasksCardTimeline, TASK_DATA });
