import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteSessionDialogProps {
  open: boolean;
  sessionTitle: string;
  isDeleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

interface DeleteSessionDialogBodyProps {
  sessionTitle: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSessionDialogBody({
  sessionTitle,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteSessionDialogBodyProps): React.ReactNode {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <DialogTitle>Delete session?</DialogTitle>
        </div>
        <DialogDescription>
          This will permanently delete the stored transcript and metadata for {sessionTitle}.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button disabled={isDeleting} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isDeleting} onClick={onConfirm} type="button" variant="destructive">
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}

export function DeleteSessionDialog({
  open,
  sessionTitle,
  isDeleting = false,
  onOpenChange,
  onConfirm,
}: DeleteSessionDialogProps): React.ReactNode {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DeleteSessionDialogBody
          isDeleting={isDeleting}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
          sessionTitle={sessionTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
