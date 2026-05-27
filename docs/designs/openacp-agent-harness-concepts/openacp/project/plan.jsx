// plan.jsx — Plan card variants
// Four concepts: streaming, collapsed teaser, full expanded, approve/edit inline.

const PLAN_TITLE = "Git Feature Pilot and Header Upgrade";

const PLAN_SUMMARY = `Adopt an incremental feature-based structure starting with a full git vertical slice under src/mainview/features/git. This pilot should own git UI, git-specific state/cache, and git presentation helpers, while leaving the rest of src/mainview unchanged for now. The first user-facing change is to replace the header's passive branch badge with an interactive branch switcher plus compact +/− diff-line totals for the active session's repo.`;

const PLAN_CHANGES = [
  "Create src/mainview/features/git as the single home for git-specific code used by the mainview app.",
  "Move existing git-specific UI into that feature; flatten internal subfolders so the entry point is index.tsx.",
  "Introduce a feature-local store slice for branch + diff state, hydrated lazily on first git interaction.",
  "Wire the new BranchSwitcher into the chat topbar, replacing the static badge with a popover.",
  "Expose live +/− diff totals computed from staged + unstaged changes, with subtle pulse on update.",
];

const PLAN_FILES = [
  { name: "src/mainview/features/git/index.tsx", add: 124, del: 0, kind: "new" },
  { name: "src/mainview/features/git/branch-switcher.tsx", add: 86, del: 0, kind: "new" },
  { name: "src/mainview/features/git/store.ts", add: 42, del: 0, kind: "new" },
  { name: "src/mainview/topbar/topbar.tsx", add: 14, del: 22, kind: "mod" },
  { name: "src/mainview/components/BranchBadge.tsx", add: 0, del: 38, kind: "del" },
];

/* Shared title block */
const PlanHeader = ({ title, kicker, streaming, onCollapse, collapsed }) => (
  <div
    style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: collapsed ? 0 : 14,
      flexDirection: "column",
    }}
  >
    <span
      style={{
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.7,
        flexShrink: 0,
        marginTop: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {streaming && (
        <span
          className="oacp-spinner"
          style={{ width: 9, height: 9, borderWidth: 1.2, color: "var(--accent)" }}
        />
      )}
      {kicker}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      {!collapsed && (
        <h3
          className="oacp-mono"
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: -0.3,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h3>
      )}
      {collapsed && <div style={{ fontSize: 13, color: "var(--text)" }}>{title}</div>}
    </div>
    {onCollapse && (
      <button
        onClick={onCollapse}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          marginTop: 2,
        }}
      >
        <window.Icon.ChevronExpand open={!collapsed} />
      </button>
    )}
  </div>
);

/* ── Variant A — Streaming (writing plan, live reveal) */
const PlanCardStreaming = ({ title = PLAN_TITLE }) => {
  const [chars, setChars] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setChars((c) => Math.min(PLAN_SUMMARY.length, c + 4)), 24);
    return () => clearInterval(id);
  }, []);
  const written = PLAN_SUMMARY.slice(0, chars);
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "14px 16px 16px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <PlanHeader kicker="Writing plan" title={title} streaming={true} />
      <h4
        className="oacp-mono"
        style={{ margin: "8px 0 6px", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
      >
        Summary
      </h4>
      <p
        className="oacp-mono"
        style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}
      >
        <span>{written}</span>
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 13,
            marginLeft: 2,
            verticalAlign: "text-bottom",
            background: "var(--text)",
            opacity: 0.7,
            animation: "oacp-pulse 1s infinite",
          }}
        />
      </p>
      {chars >= PLAN_SUMMARY.length && (
        <>
          <h4
            className="oacp-mono"
            style={{
              margin: "14px 0 6px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            Key Changes
          </h4>
          <ul
            className="oacp-mono"
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text-muted)",
            }}
          >
            <li>
              Create{" "}
              <code
                style={{
                  background: "var(--surface-2)",
                  padding: "1px 4px",
                  borderRadius: 3,
                  color: "var(--text)",
                }}
              >
                src/mainview/features/git
              </code>{" "}
              as the single home for git-specific code used by the mainview app.
            </li>
            <li style={{ opacity: 0.5 }}>Move existing git-specific UI into that feature…</li>
          </ul>
        </>
      )}
    </div>
  );
};

/* ── Variant B — Collapsed teaser (Codex-style "Expand plan" pill) */
const PlanCardTeaser = ({ title = PLAN_TITLE }) => {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "14px 16px 0",
        position: "relative",
        animation: "oacp-fade-in .25s",
        overflow: "hidden",
      }}
    >
      <PlanHeader kicker="Plan ready" title={title} />
      <h4
        className="oacp-mono"
        style={{ margin: "4px 0 6px", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
      >
        Summary
      </h4>
      <p
        className="oacp-mono"
        style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}
      >
        {PLAN_SUMMARY}
      </p>
      <h4
        className="oacp-mono"
        style={{ margin: "12px 0 6px", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
      >
        Key Changes
      </h4>
      <ul
        className="oacp-mono"
        style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}
      >
        <li>
          Create{" "}
          <code style={{ background: "var(--surface-2)", padding: "1px 4px", borderRadius: 3 }}>
            src/mainview/features/git
          </code>{" "}
          as the single home for git-specific code used by the mainview app.
        </li>
        <li>Move existing git-specific UI into that feature.</li>
      </ul>
      <div style={{ height: 80, position: "relative" }}>
        {/* fade overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, transparent, var(--bg-elev) 70%)",
            pointerEvents: "none",
          }}
        />
        <button
          style={{
            position: "absolute",
            bottom: 14,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 14px",
            borderRadius: "var(--radius-pill)",
            background: "var(--text)",
            color: "var(--bg)",
            fontSize: 12.5,
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          Expand plan
        </button>
      </div>
    </div>
  );
};

/* ── Variant C — Sectioned outline (TOC + active section view) */
const PlanCardSectioned = ({ title = PLAN_TITLE }) => {
  const sections = ["Summary", "Key Changes", "Files", "Risks"];
  const [active, setActive] = React.useState("Key Changes");
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        animation: "oacp-fade-in .25s",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px 10px" }}>
        <PlanHeader kicker="Plan" title={title} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {sections.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            style={{
              padding: "8px 10px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: active === s ? "var(--text)" : "var(--text-muted)",
              borderBottom: active === s ? "1.5px solid var(--accent)" : "1.5px solid transparent",
              marginBottom: -1,
            }}
          >
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>
          3 files · +266 / −60
        </span>
      </div>
      <div style={{ padding: "14px 16px 16px", maxHeight: 200, overflowY: "auto" }}>
        {active === "Summary" && (
          <p
            className="oacp-mono"
            style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}
          >
            {PLAN_SUMMARY}
          </p>
        )}
        {active === "Key Changes" && (
          <ul
            className="oacp-mono"
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--text)",
            }}
          >
            {PLAN_CHANGES.map((c, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {c.split(/(`[^`]+`|src\/[^\s.]+(?:\.[a-z]+)?)/).map((part, j) =>
                  part.match(/^src\//) ? (
                    <code
                      key={j}
                      style={{
                        background: "var(--surface-2)",
                        padding: "1px 4px",
                        borderRadius: 3,
                      }}
                    >
                      {part}
                    </code>
                  ) : (
                    part
                  ),
                )}
              </li>
            ))}
          </ul>
        )}
        {active === "Files" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLAN_FILES.map((f) => (
              <div
                key={f.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12.5,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      f.kind === "new"
                        ? "oklch(0.82 0.13 150 / 0.15)"
                        : f.kind === "del"
                          ? "oklch(0.74 0.14 25 / 0.15)"
                          : "var(--surface-2)",
                    color:
                      f.kind === "new"
                        ? "oklch(0.82 0.13 150)"
                        : f.kind === "del"
                          ? "oklch(0.74 0.14 25)"
                          : "var(--text-muted)",
                  }}
                >
                  {f.kind === "new" ? "+" : f.kind === "del" ? "−" : "M"}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <span style={{ color: "oklch(0.82 0.13 150)" }}>+{f.add}</span>
                <span style={{ color: "oklch(0.74 0.14 25)" }}>−{f.del}</span>
              </div>
            ))}
          </div>
        )}
        {active === "Risks" && (
          <ul
            className="oacp-mono"
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text)",
            }}
          >
            <li>Existing imports of BranchBadge break and must be migrated.</li>
            <li>Lazy store hydration may cause a 1-frame flash on first git interaction.</li>
          </ul>
        )}
      </div>
    </div>
  );
};

/* ── Variant D — Approve / Edit inline (acts as plan + permission) */
const PlanCardApprove = ({ title = PLAN_TITLE }) => {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        animation: "oacp-fade-in .25s",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px 12px" }}>
        <PlanHeader kicker="Plan ready · review" title={title} />
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span className="oacp-chip">5 changes</span>
          <span className="oacp-chip diff-add">+266</span>
          <span className="oacp-chip diff-del">−60</span>
          <span className="oacp-chip">~2 min</span>
          <span className="oacp-chip">3 files</span>
        </div>
        <h4
          className="oacp-mono"
          style={{ margin: "12px 0 6px", fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}
        >
          Key Changes
        </h4>
        <ul
          className="oacp-mono"
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-muted)",
          }}
        >
          {PLAN_CHANGES.slice(0, 3).map((c, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {c}
            </li>
          ))}
          <li style={{ color: "var(--text-faint)" }}>…and 2 more</li>
        </ul>
      </div>
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-0)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          style={{
            padding: "7px 14px",
            borderRadius: 7,
            background: "var(--text)",
            color: "var(--bg)",
            fontSize: 12.5,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <window.Icon.Check /> Approve & implement
        </button>
        <button
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            background: "var(--surface-1)",
            color: "var(--text)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <window.Icon.Pencil /> Edit plan
        </button>
        <button
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            color: "var(--text-muted)",
            fontSize: 12.5,
          }}
        >
          Discard
        </button>
        <div style={{ flex: 1 }} />
        <span className="oacp-kbd">
          <window.Icon.Check /> Enter
        </span>
      </div>
    </div>
  );
};

Object.assign(window, {
  PlanCardStreaming,
  PlanCardTeaser,
  PlanCardSectioned,
  PlanCardApprove,
  PLAN_TITLE,
  PLAN_SUMMARY,
  PLAN_CHANGES,
  PLAN_FILES,
});
