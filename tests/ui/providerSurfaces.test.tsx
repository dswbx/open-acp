import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderRadioGroup } from "../../src/mainview/components/ProviderRadioGroup.tsx";
import { ProviderSelect } from "../../src/mainview/features/settings/sections/GeneralSection.tsx";

describe("provider UI surfaces", () => {
  it("renders Cursor in shared provider radio choices used by session and workspace dialogs", () => {
    const html = renderToStaticMarkup(
      <ProviderRadioGroup disabled={false} onChange={() => {}} value="cursor" />,
    );

    expect(html).toContain("Cursor");
    expect(html).toContain('aria-label="Cursor"');
  });

  it("renders the selected Cursor provider in settings provider selects", () => {
    const html = renderToStaticMarkup(<ProviderSelect onChange={() => {}} value="cursor" />);

    expect(html).toContain("Cursor");
  });
});
