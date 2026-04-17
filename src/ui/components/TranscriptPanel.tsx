import React from "react";

export interface TranscriptEntry {
  id: string;
  author: "user" | "agent" | "system";
  text: string;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export class TranscriptPanel extends React.Component<TranscriptPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Transcript
        </h2>
        <div className="space-y-3">
          {this.props.entries.map((entry) => (
            <article
              className="rounded-md border border-zinc-200 p-3"
              key={entry.id}
            >
              <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
                {entry.author}
              </div>
              <p className="text-sm leading-relaxed text-zinc-900">
                {entry.text}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }
}

