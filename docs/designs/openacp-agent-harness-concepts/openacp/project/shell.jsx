// shell.jsx — open-acp app chrome: sidebar, topbar, chat area, git panel, composer
// All components exported via window.* for use in other Babel scripts.

/* ── ICONS ─────────────────────────────────────────────────────── */
const Icon = {
  Folder: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 4.5a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v6.5a1 1 0 01-1 1h-10.5a1 1 0 01-1-1v-8z" />
    </svg>
  ),
  Plus: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Chevron: ({ dir = "down" }) => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: dir === "up" ? "rotate(180deg)" : dir === "right" ? "rotate(-90deg)" : "none",
      }}
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  ),
  Branch: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <path d="M4 4.5v7M5.5 6c4 0 5 .5 5 3.5" />
    </svg>
  ),
  Sun: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
    </svg>
  ),
  Settings: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      <path d="M8 1.4l1.4 1.6 2.1-.3.6 2 1.9.9-.6 2 1 1.9-1.6 1.4.3 2.1-2 .6-.9 1.9-2-.6-1.9 1-1.4-1.6-2.1.3-.6-2-1.9-.9.6-2-1-1.9 1.6-1.4-.3-2.1 2-.6.9-1.9 2 .6z" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  ),
  Panel: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M10 3v10" />
    </svg>
  ),
  Inspector: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" strokeLinecap="round" />
    </svg>
  ),
  Files: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 2h6l4 4v8H3z" />
      <path d="M9 2v4h4" />
    </svg>
  ),
  Send: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13V3M8 3l-4 4M8 3l4 4" />
    </svg>
  ),
  Mic: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2" />
    </svg>
  ),
  Plan: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 4h6M3 8h8M3 12h4" />
      <circle cx="13" cy="4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  Tasks: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4h2M3 8h2M3 12h2M7 4h6M7 8h6M7 12h6" />
    </svg>
  ),
  Computer: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M6 13h4M8 11v2" strokeLinecap="round" />
    </svg>
  ),
  Check: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6L5 8.5l4.5-5" />
    </svg>
  ),
  Circle: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="6" cy="6" r="4.5" />
    </svg>
  ),
  Dot: () => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
      <circle cx="6" cy="6" r="1.6" />
    </svg>
  ),
  Stop: () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="2" y="2" width="6" height="6" rx="1" />
    </svg>
  ),
  Terminal: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 7l2 1.5L5 10M9 10h3" />
    </svg>
  ),
  Pencil: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 2l3 3-8 8H3v-3z" />
    </svg>
  ),
  Globe: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
    </svg>
  ),
  Shield: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5L2.5 3.5v4c0 3.5 2.5 6 5.5 7 3-1 5.5-3.5 5.5-7v-4z" />
    </svg>
  ),
  ChevronExpand: ({ open }) => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
    >
      <path d="M3 4.5L6 7.5l3-3" />
    </svg>
  ),
  Hand: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7V4a1 1 0 112 0v3M7 6V3a1 1 0 112 0v4M9 5a1 1 0 112 0v5M11 6a1 1 0 112 0v3a4 4 0 01-4 4H7a4 4 0 01-4-4V8a1 1 0 012 0v1" />
    </svg>
  ),
  ArrowDown: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" />
    </svg>
  ),
  Close: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  ),
  Spark: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" />
    </svg>
  ),
};

/* ── TRAFFIC LIGHTS ────────────────────────────────────────────── */
const TrafficLights = () => (
  <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
    <span style={{ width: 12, height: 12, borderRadius: 6, background: "#ff5f57" }} />
    <span style={{ width: 12, height: 12, borderRadius: 6, background: "#febc2e" }} />
    <span style={{ width: 12, height: 12, borderRadius: 6, background: "#28c840" }} />
  </div>
);

/* ── SIDEBAR ───────────────────────────────────────────────────── */
const Sidebar = ({ sessions = SHELL_DEFAULT_SESSIONS, activeId = "s2" }) => (
  <aside
    style={{
      width: 260,
      flexShrink: 0,
      background: "var(--bg-elev)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <TrafficLights />
    <div
      style={{
        padding: "14px 14px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderRadius: 6,
          color: "var(--text-muted)",
        }}
      >
        <Icon.Chevron dir="down" />
        <Icon.Folder />
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>open-acp</span>
      </button>
      <button
        title="New session"
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "var(--surface-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        <Icon.Plus />
      </button>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
      {sessions.map((s) => (
        <div
          key={s.id}
          style={{
            padding: "10px 12px",
            marginBottom: 2,
            borderRadius: 8,
            background: s.id === activeId ? "var(--surface-2)" : "transparent",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: s.id === activeId ? 500 : 400,
                color: s.id === activeId ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {s.title}
            </span>
            {s.unread && (
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }} />
            )}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-faint)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {s.subtitle}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.8,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          padding: "6px 8px 4px",
        }}
      >
        Workspaces
      </div>
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 8px",
          borderRadius: 6,
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        <Icon.Folder /> jsonv-ts
      </button>
    </div>
  </aside>
);

const SHELL_DEFAULT_SESSIONS = [
  { id: "s1", title: "open-acp ses_4f2a", subtitle: "/Users/dennis/Documents/Pr…", unread: false },
  { id: "s2", title: "open-acp ses_19cf", subtitle: "/Users/dennis/Documents/Pr…", unread: true },
  { id: "s3", title: "open-acp ses_19ce", subtitle: "/Users/dennis/Documents/Pr…", unread: false },
];

/* ── TOPBAR ────────────────────────────────────────────────────── */
const Topbar = ({
  title = "Chat",
  branch = "main",
  diff = { add: 14, del: 3 },
  file = "jsonv-ts",
}) => (
  <header
    style={{
      height: 52,
      flexShrink: 0,
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "0 18px",
    }}
  >
    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{title}</span>
    <button
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        borderRadius: 6,
        background: "var(--surface-1)",
        color: "var(--text-muted)",
        fontSize: 12,
      }}
    >
      <Icon.Branch />
      <span style={{ color: "var(--text)" }}>{branch}</span>
      <Icon.Chevron dir="down" />
    </button>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "oklch(0.82 0.13 150)" }}>+{diff.add}</span>
      <span style={{ color: "oklch(0.74 0.14 25)" }}>−{diff.del}</span>
      <span style={{ color: "var(--text-muted)" }}>{file}</span>
    </div>
    <div style={{ flex: 1 }} />
    <button style={iconBtnStyle}>
      <Icon.Sun />
    </button>
    <button style={iconBtnStyle}>
      <Icon.Settings />
    </button>
    <button style={iconBtnStyle}>
      <Icon.Panel />
    </button>
  </header>
);

const iconBtnStyle = {
  width: 30,
  height: 30,
  borderRadius: 7,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
};

/* ── GIT PANEL (right) ─────────────────────────────────────────── */
const GitPanel = ({ branch = "main", diff = { add: 1, del: 1 } }) => (
  <aside
    style={{
      width: 320,
      flexShrink: 0,
      borderLeft: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
    }}
  >
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          fontSize: 12.5,
        }}
      >
        <Icon.Inspector /> Inspector
      </button>
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          fontSize: 12.5,
        }}
      >
        <Icon.Files /> Files
      </button>
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text)",
          fontSize: 12.5,
          padding: "4px 8px",
          borderRadius: 6,
          background: "var(--surface-2)",
        }}
      >
        <Icon.Branch /> Git
      </button>
      <div style={{ flex: 1 }} />
      <button style={{ ...iconBtnStyle, width: 24, height: 24 }}>
        <Icon.Plus />
      </button>
    </div>
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 8px",
          borderRadius: 6,
          background: "var(--surface-1)",
          color: "var(--text)",
          fontSize: 12,
        }}
      >
        <Icon.Branch /> {branch} <Icon.Chevron dir="down" />
      </button>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.82 0.13 150)" }}>
        +{diff.add}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.74 0.14 25)" }}>
        −{diff.del}
      </span>
      <div style={{ flex: 1 }} />
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 5a6 6 0 0110-2.5L13 4M14 11a6 6 0 01-10 2.5L3 12" />
        <path d="M13 1v3h-3M3 15v-3h3" />
      </svg>
    </div>
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          color: "var(--text)",
        }}
      >
        <Icon.Chevron dir="down" />
        <span>
          src/lib/<span style={{ color: "var(--text)" }}>index.ts</span>
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "oklch(0.82 0.13 150)" }}>+1</span>
        <span style={{ color: "oklch(0.74 0.14 25)" }}>−1</span>
      </div>
      <pre style={{ margin: 0, lineHeight: 1.7, color: "var(--text-muted)", whiteSpace: "pre" }}>
        {`60  export type { JSONSchemaDefinition,
    JSONSchema } from "./types";
`}
        <span
          style={{
            background: "oklch(0.74 0.14 25 / 0.12)",
            display: "inline-block",
            width: "100%",
          }}
        >{`61  export { registerFormat,
    getFormats } from "./validation/format";`}</span>
        {`
`}
        <span
          style={{
            background: "oklch(0.82 0.13 150 / 0.12)",
            display: "inline-block",
            width: "100%",
          }}
        >{`61  export { registerFormat,
    unregisterFormat, getFormats }
    from "./validation/format";`}</span>
        {`
62  export { toDefinition, toTypes,
    schemaToTypes } from "./utils/types";`}
      </pre>
    </div>
  </aside>
);

/* ── CHAT MESSAGES ─────────────────────────────────────────────── */
const UserBubble = ({ children }) => (
  <div
    style={{
      alignSelf: "flex-end",
      maxWidth: "72%",
      padding: "10px 14px",
      borderRadius: "14px 14px 4px 14px",
      background: "var(--surface-2)",
      fontSize: 14,
      lineHeight: 1.5,
      color: "var(--text)",
    }}
  >
    {children}
  </div>
);

const AgentText = ({ children }) => (
  <div style={{ maxWidth: "92%", fontSize: 14, lineHeight: 1.6, color: "var(--text)" }}>
    {children}
  </div>
);

const ThoughtLine = ({ children }) => (
  <div
    style={{
      fontSize: 13,
      color: "var(--text-muted)",
      fontFamily: "var(--font-mono)",
      padding: "2px 0",
    }}
  >
    {children}
  </div>
);

/* ── COMPOSER ──────────────────────────────────────────────────── */
const Composer = ({
  placeholder = "Ask for follow-up changes",
  mode = "default",
  value = "",
  children,
  model = "claude-sonnet-4.5",
  permLabel = "Default permissions",
  running = false,
}) => {
  return (
    <div style={{ padding: "0 24px 16px", position: "relative" }}>
      {children /* slot for floating cards above */}
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-composer)",
          padding: "14px 16px 10px",
        }}
      >
        <div style={{ minHeight: 38, fontSize: 14, color: "var(--text-faint)" }}>
          {value || placeholder}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <button style={{ ...iconBtnStyle, width: 26, height: 26 }}>
            <Icon.Plus />
          </button>
          <button style={pillBtnStyle}>
            <Icon.Hand /> {permLabel} <Icon.Chevron dir="down" />
          </button>
          <div style={{ flex: 1 }} />
          <button style={pillBtnStyle}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "oklch(0.78 0.10 150)",
                boxShadow: "0 0 0 2px oklch(0.78 0.10 150 / 0.18)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {model} <Icon.Chevron dir="down" />
          </button>
          <button style={pillBtnStyle}>
            High <Icon.Chevron dir="down" />
          </button>
          {mode === "plan" && (
            <button
              style={{ ...pillBtnStyle, background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Icon.Plan /> Plan
            </button>
          )}
          <button style={{ ...iconBtnStyle, width: 28, height: 28 }}>
            <Icon.Mic />
          </button>
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: running ? "var(--text)" : "var(--text)",
              color: "var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {running ? <Icon.Stop /> : <Icon.Send />}
          </button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 6px 0",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <button style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon.Computer /> Work locally <Icon.Chevron dir="down" />
        </button>
        <button style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon.Branch /> main <Icon.Chevron dir="down" />
        </button>
      </div>
    </div>
  );
};

const pillBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 9px",
  borderRadius: 7,
  fontSize: 12,
  color: "var(--text-muted)",
  background: "transparent",
};

/* ── SCROLL-TO-BOTTOM ──────────────────────────────────────────── */
const ScrollToBottom = () => (
  <button
    style={{
      position: "absolute",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      width: 28,
      height: 28,
      borderRadius: 14,
      background: "var(--bg-elev)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}
  >
    <Icon.ArrowDown />
  </button>
);

/* ── CHAT AREA WRAPPER ─────────────────────────────────────────── */
const ChatArea = ({ children, composer, floating }) => (
  <main
    style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}
  >
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        position: "relative",
      }}
    >
      {children}
      <ScrollToBottom />
    </div>
    {composer || <Composer>{floating}</Composer>}
  </main>
);

/* ── APP SHELL (full chrome) ───────────────────────────────────── */
const AppShell = ({ children, showSidebar = true, showGitPanel = true, topbarProps = {} }) => (
  <div className="oacp-root" style={{ flexDirection: "row" }}>
    {showSidebar && <Sidebar />}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Topbar {...topbarProps} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {children}
        </div>
        {showGitPanel && <GitPanel />}
      </div>
    </div>
  </div>
);

/* ── CHROME-LITE (no sidebar/git, just chat for variation cards) ── */
const ChatFrame = ({ children, topTitle }) => (
  <div className="oacp-root">
    {topTitle && (
      <div
        style={{
          height: 42,
          flexShrink: 0,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>{topTitle}</span>
      </div>
    )}
    {children}
  </div>
);

Object.assign(window, {
  Icon,
  Sidebar,
  Topbar,
  GitPanel,
  Composer,
  ChatArea,
  AppShell,
  ChatFrame,
  UserBubble,
  AgentText,
  ThoughtLine,
  TrafficLights,
  ScrollToBottom,
  iconBtnStyle,
  pillBtnStyle,
});
