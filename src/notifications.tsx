import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { text } from "./app-model";

export function Notifications({ children }: { children: ReactNode }) {
  useEffect(() => {
    const invalid = (event: Event) => {
      const target = event.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement
        )
      )
        return;
      event.preventDefault();
      const label =
        target.labels?.[0]?.textContent ||
        target.getAttribute("aria-label") ||
        target.name;
      toast.error(text("입력값을 확인하세요.", "Check the input."), {
        id: "form-validation",
        description: [label, target.validationMessage]
          .filter(Boolean)
          .join(" · "),
      });
    };
    document.addEventListener("invalid", invalid, true);
    return () => document.removeEventListener("invalid", invalid, true);
  }, []);
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
