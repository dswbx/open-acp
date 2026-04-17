import React from "react";
import { Button } from "@base-ui/react/button";

interface PrimaryButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export class PrimaryButton extends React.Component<PrimaryButtonProps> {
  render(): React.ReactNode {
    return (
      <Button
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
        disabled={this.props.disabled}
        onClick={this.props.onClick}
      >
        {this.props.label}
      </Button>
    );
  }
}
