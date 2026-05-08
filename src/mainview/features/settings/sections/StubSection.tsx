interface StubSectionProps {
  title: string;
}

export function StubSection({ title }: StubSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-semibold leading-tight">{title}</h2>
      <p className="text-muted-foreground">
        This section is a placeholder. The corresponding feature is not yet implemented in open-acp.
      </p>
    </div>
  );
}
