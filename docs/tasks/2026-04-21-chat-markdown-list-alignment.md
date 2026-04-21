# Chat Markdown List Alignment

## Done

- Checked the live desktop chat surface under `src/mainview`.
- Traced markdown rendering to `MessageResponse`, which uses Streamdown.
- Added a chat-scoped CSS override so ordered and unordered markdown lists use outside markers with stable padding.

## Notes

- Streamdown's default list classes use inside markers, which causes wrapped list text to align under the bullet instead of the first line's text.
- Existing unrelated changes in `src/ui/components/SessionListPanel.tsx` were left untouched.
