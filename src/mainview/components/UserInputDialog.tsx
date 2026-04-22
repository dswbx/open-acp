import React from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import type { UserInputEventPayload, UserInputOutcome } from "../../shared/AppRPC.ts";

type PendingUserInput = Extract<UserInputEventPayload, { kind: "requested" }>;

interface UserInputDialogProps {
  input?: PendingUserInput;
  isResponding: boolean;
  onCancel: () => void;
  onSubmit: (outcome: UserInputOutcome) => void;
}

export const UserInputDialog = ({
  input,
  isResponding,
  onCancel,
  onSubmit,
}: UserInputDialogProps): React.ReactNode => {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!input) {
      setAnswers({});
      return;
    }
    setAnswers(
      Object.fromEntries(input.fields.map((field) => [field.id, field.options[0]?.value ?? ""])),
    );
  }, [input]);

  if (!input) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        aria-labelledby="user-input-dialog-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl border border-border bg-card shadow-xl"
        role="dialog"
      >
        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent question
            </p>
            <h2 className="text-lg font-semibold text-card-foreground" id="user-input-dialog-title">
              The agent needs your input before continuing.
            </h2>
          </div>

          <div className="space-y-4">
            {input.fields.map((field) => {
              const currentValue = answers[field.id] ?? "";
              const showCustomInput =
                field.allowOther &&
                currentValue.length > 0 &&
                !field.options.some((option) => option.value === currentValue);

              return (
                <div className="space-y-3" key={field.id}>
                  {field.header ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {field.header}
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-foreground">{field.question}</p>
                  <div className="space-y-2">
                    {field.options.map((option) => (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm"
                        key={option.value}
                      >
                        <input
                          checked={currentValue === option.value}
                          className="mt-0.5"
                          disabled={isResponding}
                          name={field.id}
                          onChange={() => {
                            setAnswers((previous) => ({
                              ...previous,
                              [field.id]: option.value,
                            }));
                          }}
                          type="radio"
                        />
                        <span className="space-y-1">
                          <span className="block text-foreground">{option.label}</span>
                          {option.description ? (
                            <span className="block text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                    {field.allowOther ? (
                      <div className="space-y-2">
                        <Button
                          disabled={isResponding}
                          onClick={() => {
                            setAnswers((previous) => ({
                              ...previous,
                              [field.id]: field.options.some(
                                (option) => option.value === previous[field.id],
                              )
                                ? ""
                                : (previous[field.id] ?? ""),
                            }));
                          }}
                          type="button"
                          variant="outline"
                        >
                          Enter another answer
                        </Button>
                        {showCustomInput || currentValue === "" ? (
                          <Input
                            disabled={isResponding}
                            onChange={(event) => {
                              setAnswers((previous) => ({
                                ...previous,
                                [field.id]: event.target.value,
                              }));
                            }}
                            type={field.secret ? "password" : "text"}
                            value={currentValue}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">
          <Button disabled={isResponding} onClick={onCancel} variant="outline">
            {isResponding ? "Working..." : "Cancel"}
          </Button>
          <Button
            disabled={isResponding}
            onClick={() => {
              onSubmit({
                outcome: "submitted",
                answers: input.fields.map((field) => ({
                  fieldId: field.id,
                  value: answers[field.id] ?? "",
                })),
              });
            }}
          >
            {isResponding ? "Working..." : "Submit"}
          </Button>
        </div>
      </section>
    </div>
  );
};
