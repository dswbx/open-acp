export interface ACPProtocolLimitation {
  capability: string;
  detail: string;
  impact: string;
}

export class ACPProtocolInsights {
  static readonly LatestMatrixGeneratedAt = "2026-04-16T07:04:00+00:00";
  static readonly MatrixSource =
    "https://github.com/agentclientprotocol/registry/.protocol-matrix/latest.md";

  static listKnownLimitations(): ACPProtocolLimitation[] {
    return [
      {
        capability: "session/stop",
        detail:
          "Method probe summary reported 0/25 support and 25/25 method-not-found.",
        impact:
          "Treat hard stop as unsupported by default; prefer session/cancel for turn cancellation."
      },
      {
        capability: "session/list",
        detail:
          "Support exists but is optional and inconsistent across agents.",
        impact:
          "UI and orchestrator logic must feature-detect session listing before invoking it."
      },
      {
        capability: "session/fork and session/resume",
        detail: "These are optional capabilities and not broadly implemented.",
        impact:
          "Expose only when advertised in initialize sessionCapabilities."
      },
      {
        capability: "model catalog and context window metadata",
        detail:
          "Not guaranteed in stable ACP schema; implementations may expose this via agent-specific metadata or extensions.",
        impact:
          "Normalize into optional fields and keep a graceful 'unknown context window' fallback."
      }
    ];
  }
}

