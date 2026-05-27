// permissions.jsx — Permission approval card variants
// All variants float ABOVE the composer (so composer stays usable for "tell what to do differently")

/* Reused button row for variants */
const PermButtons = ({ primaryLabel = "Allow", primaryIcon, danger = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
    <button
      style={{
        padding: "7px 14px",
        borderRadius: 7,
        background: danger ? "var(--danger)" : "var(--text)",
        color: "var(--bg)",
        fontSize: 12.5,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {primaryIcon}
      {primaryLabel}
    </button>
    <button
      style={{
        padding: "7px 12px",
        borderRadius: 7,
        background: "var(--surface-1)",
        color: "var(--text)",
        fontSize: 12.5,
      }}
    >
      Always allow
    </button>
    <button
      style={{
        padding: "7px 12px",
        borderRadius: 7,
        color: "var(--text-muted)",
        fontSize: 12.5,
      }}
    >
      Deny
    </button>
    <div style={{ flex: 1 }} />
    <span
      style={{
        fontSize: 11,
        color: "var(--text-faint)",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      Or tell open-acp what to do differently below
    </span>
  </div>
);

/* ── Variant A — Shell command (Codex-style, monospace) */
const PermissionShell = () => {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "12px 14px 12px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--warn-soft)",
            color: "oklch(0.78 0.10 60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <window.Icon.Terminal />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
          Run shell command?
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          in <span style={{ color: "var(--text-muted)" }}>~/jsonv-ts</span>
        </span>
      </div>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          padding: "10px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--text)",
          overflowX: "auto",
        }}
      >
        <span style={{ color: "var(--text-faint)", userSelect: "none", marginRight: 8 }}>$</span>
        <span>pnpm run </span>
        <span style={{ color: "oklch(0.82 0.13 60)" }}>test</span>
        <span style={{ color: "var(--text-muted)" }}> --filter </span>
        <span style={{ color: "oklch(0.82 0.13 150)" }}>"format/*"</span>
      </div>
      <PermButtons primaryLabel="Allow" primaryIcon={<window.Icon.Check />} />
    </div>
  );
};

/* ── Variant B — File write/edit with mini diff */
const PermissionFileEdit = () => {
  const diffLines = [
    {
      n: 60,
      type: "ctx",
      text: 'export type { JSONSchemaDefinition, JSONSchema } from "./types";',
    },
    {
      n: 61,
      type: "del",
      text: 'export { registerFormat, getFormats } from "./validation/format";',
    },
    {
      n: 61,
      type: "add",
      text: 'export { registerFormat, unregisterFormat, getFormats } from "./validation/format";',
    },
    {
      n: 62,
      type: "ctx",
      text: 'export { toDefinition, toTypes, schemaToTypes } from "./utils/types";',
    },
  ];
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "12px 14px 12px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <window.Icon.Pencil />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Edit file?</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          src/lib/index.ts
        </span>
        <span className="oacp-chip diff-add">+1</span>
        <span className="oacp-chip diff-del">−1</span>
      </div>
      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          overflow: "hidden",
        }}
      >
        {diffLines.map((l, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              background:
                l.type === "add"
                  ? "oklch(0.82 0.13 150 / 0.08)"
                  : l.type === "del"
                    ? "oklch(0.74 0.14 25 / 0.08)"
                    : "transparent",
              color: l.type === "ctx" ? "var(--text-muted)" : "var(--text)",
            }}
          >
            <span
              style={{
                width: 36,
                padding: "4px 8px",
                textAlign: "right",
                color: "var(--text-faint)",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {l.n}
            </span>
            <span
              style={{
                width: 14,
                padding: "4px 0",
                textAlign: "center",
                color: "var(--text-faint)",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {l.type === "add" ? "+" : l.type === "del" ? "−" : " "}
            </span>
            <span
              style={{
                padding: "4px 8px 4px 4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {l.text}
            </span>
          </div>
        ))}
      </div>
      <PermButtons primaryLabel="Apply edit" primaryIcon={<window.Icon.Check />} />
    </div>
  );
};

/* ── Variant C — MCP / Network tool call (with collapsed args) */
const PermissionMCP = () => {
  const [showArgs, setShowArgs] = React.useState(true);
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "12px 14px 12px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "oklch(0.78 0.10 290 / 0.18)",
            color: "oklch(0.78 0.10 290)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <window.Icon.Globe />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Call MCP tool?</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
          github.create_pull_request
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          api.github.com
        </span>
      </div>
      <button
        onClick={() => setShowArgs((s) => !s)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          background: "var(--surface-0)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          marginBottom: 6,
        }}
      >
        <window.Icon.ChevronExpand open={showArgs} />4 arguments
      </button>
      {showArgs && (
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "10px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.6,
            overflowX: "auto",
          }}
        >
          <div>
            <span style={{ color: "oklch(0.82 0.13 290)" }}>owner</span>
            <span style={{ color: "var(--text-faint)" }}>: </span>
            <span style={{ color: "oklch(0.82 0.13 150)" }}>"jsonv-ts"</span>
          </div>
          <div>
            <span style={{ color: "oklch(0.82 0.13 290)" }}>repo</span>
            <span style={{ color: "var(--text-faint)" }}>: </span>
            <span style={{ color: "oklch(0.82 0.13 150)" }}>"jsonv-ts"</span>
          </div>
          <div>
            <span style={{ color: "oklch(0.82 0.13 290)" }}>title</span>
            <span style={{ color: "var(--text-faint)" }}>: </span>
            <span style={{ color: "oklch(0.82 0.13 150)" }}>"Export unregisterFormat"</span>
          </div>
          <div>
            <span style={{ color: "oklch(0.82 0.13 290)" }}>head</span>
            <span style={{ color: "var(--text-faint)" }}>: </span>
            <span style={{ color: "oklch(0.82 0.13 150)" }}>"feat/unregister-format"</span>
          </div>
        </div>
      )}
      <PermButtons primaryLabel="Call tool" primaryIcon={<window.Icon.Check />} />
    </div>
  );
};

/* ── Variant D — Stacked queue (multiple permissions in one batch) */
const PermissionQueue = () => {
  const items = [
    {
      id: 1,
      kind: "write",
      label: "Write src/mainview/features/git/index.tsx",
      detail: "124 lines · new file",
      state: "pending",
    },
    {
      id: 2,
      kind: "write",
      label: "Write src/mainview/features/git/store.ts",
      detail: "42 lines · new file",
      state: "pending",
    },
    { id: 3, kind: "shell", label: "pnpm run lint", detail: "~3s · read-only", state: "pending" },
  ];
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-float)",
        padding: "12px 14px 12px",
        animation: "oacp-fade-in .25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--surface-2)",
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          3
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
          3 actions need approval
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          Batch from "Implement git pilot"
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              background: "var(--bg)",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: it.kind === "write" ? "var(--accent-soft)" : "var(--warn-soft)",
                color: it.kind === "write" ? "var(--accent)" : "oklch(0.78 0.10 60)",
              }}
            >
              {it.kind === "write" ? <window.Icon.Pencil /> : <window.Icon.Terminal />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {it.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
                {it.detail}
              </div>
            </div>
            <button
              style={{
                padding: "3px 8px",
                borderRadius: 5,
                fontSize: 11,
                color: "var(--text-muted)",
                background: "var(--surface-1)",
              }}
            >
              Skip
            </button>
            <button
              style={{
                padding: "3px 8px",
                borderRadius: 5,
                fontSize: 11,
                color: "var(--text)",
                background: "var(--surface-2)",
              }}
            >
              Allow
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
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
          <window.Icon.Check /> Allow all
        </button>
        <button
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            background: "var(--surface-1)",
            color: "var(--text)",
            fontSize: 12.5,
          }}
        >
          Always allow this batch
        </button>
        <button
          style={{
            padding: "7px 12px",
            borderRadius: 7,
            color: "var(--text-muted)",
            fontSize: 12.5,
          }}
        >
          Deny all
        </button>
        <div style={{ flex: 1 }} />
        <span className="oacp-kbd">↵</span>
      </div>
    </div>
  );
};

Object.assign(window, { PermissionShell, PermissionFileEdit, PermissionMCP, PermissionQueue });
