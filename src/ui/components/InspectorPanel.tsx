import React from "react";
import { PrimaryButton } from "./ui/PrimaryButton.tsx";

interface InspectorPanelProps {
  modelName: string;
  contextWindow: string;
  onStop: () => void;
  onRetry: () => void;
}

export class InspectorPanel extends React.Component<InspectorPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session inspector
        </h2>
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-medium text-card-foreground">{this.props.modelName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Context</dt>
            <dd className="font-medium text-card-foreground">
              {this.props.contextWindow}
            </dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <PrimaryButton label="Stop" onClick={this.props.onStop} />
          <PrimaryButton label="Retry" onClick={this.props.onRetry} />
        </div>
      </section>
    );
  }
}
