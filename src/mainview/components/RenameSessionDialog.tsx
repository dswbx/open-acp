import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface RenameSessionDialogProps {
  open: boolean;
  initialTitle: string;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string) => void;
}

export function RenameSessionDialog({
  open,
  initialTitle,
  isSaving = false,
  onOpenChange,
  onSave,
}: RenameSessionDialogProps): React.ReactNode {
  const [title, setTitle] = useState(initialTitle);
  const trimmedTitle = title.trim();

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
    }
  }, [initialTitle, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedTitle.length > 0 && !isSaving) {
              onSave(trimmedTitle);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Session name"
            autoFocus
            disabled={isSaving}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={trimmedTitle.length === 0 || isSaving} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
