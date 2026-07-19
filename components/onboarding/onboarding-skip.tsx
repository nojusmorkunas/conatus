"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function OnboardingSkip() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const response = await fetch("/api/onboarding", { method: "POST" });
        if (!response.ok) {
          setPending(false);
          return;
        }
        router.replace("/today");
        router.refresh();
      }}
    >
      {pending ? "Starting…" : "Start without importing"}
    </Button>
  );
}
