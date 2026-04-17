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
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
        disabled={this.props.disabled}
        onClick={this.props.onClick}
      >
        {this.props.label}
      </Button>
    );
  }
}
