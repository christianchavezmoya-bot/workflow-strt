import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { AppToastProvider, useAppToast } from "./AppToastContext";
import { ConfirmProvider, useConfirm } from "./ConfirmContext";

function DialogShell({ children }: { children: ReactNode }) {
  return (
    <AppToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </AppToastProvider>
  );
}

function ConfirmProbe({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() => {
        void confirm({ title: "Large image", message: "Continue?", confirmLabel: "Continue" })
          .then(onResult);
      }}
    >
      Ask
    </button>
  );
}

describe("AppToastProvider", () => {
  it("shows a themed toast message", async () => {
    function ToastProbe() {
      const toast = useAppToast();
      return (
        <button type="button" onClick={() => toast.info("Image resized for optimal display.")}>
          Notify
        </button>
      );
    }

    render(
      <AppToastProvider>
        <ToastProbe />
      </AppToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    expect(await screen.findByText("Image resized for optimal display.")).toBeTruthy();
  });
});

describe("ConfirmProvider", () => {
  it("resolves true when the user confirms", async () => {
    const results: boolean[] = [];
    render(
      <DialogShell>
        <ConfirmProbe onResult={(value) => results.push(value)} />
      </DialogShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Continue?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(results).toEqual([true]);
  });

  it("resolves false when the user cancels", async () => {
    const results: boolean[] = [];
    render(
      <DialogShell>
        <ConfirmProbe onResult={(value) => results.push(value)} />
      </DialogShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(results).toEqual([false]);
  });
});
