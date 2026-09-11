"use client";

// FILE: src/components/admin/DecisionForm.tsx
//
// Approve/reject controls shared by the candidate queue and the retirement
// queue.
//
// Two deliberate choices:
//
// 1. The destructive action requires a confirmation click. Publishing spends
//    supplier money and retiring removes a live product; neither should happen
//    because someone mis-tapped on a phone.
//
// 2. The result message is shown inline rather than as a toast that vanishes.
//    A publish can fail for real reasons — no supplier price, margin too thin —
//    and the admin needs to be able to read why.

import { useState, useTransition } from "react";

export interface DecisionOption {
  label: string;
  value: string;
  /// Requires a second click before it runs.
  confirm?: boolean;
  tone?: "primary" | "danger" | "quiet";
}

const TONES: Record<string, string> = {
  primary: "bg-poppy text-white hover:opacity-90",
  danger: "border border-poppy/40 text-poppy hover:bg-poppy/5",
  quiet: "border border-ink/15 text-ink-soft hover:bg-cream-soft",
};

export function DecisionForm({
  action,
  hidden,
  options,
  fieldName,
  showNote = true,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; message: string }>;
  /// Fixed values submitted with every option, e.g. { candidateId: "..." }.
  hidden: Record<string, string>;
  options: DecisionOption[];
  /// Name of the field the chosen option value is submitted under.
  fieldName: string;
  showNote?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function submit(option: DecisionOption) {
    if (option.confirm && armed !== option.value) {
      setArmed(option.value);
      return;
    }

    setArmed(null);

    startTransition(async () => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(hidden)) {
        formData.set(key, value);
      }
      formData.set(fieldName, option.value);
      if (note) formData.set("note", note);

      try {
        setResult(await action(formData));
      } catch (error) {
        setResult({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        });
      }
    });
  }

  // Once an action has succeeded the controls are replaced, so a published
  // candidate cannot be published twice by an impatient second click.
  if (result?.ok) {
    return (
      <p className="mt-4 rounded-xl border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-ink">
        {result.message}
      </p>
    );
  }

  return (
    <div className="mt-4">
      {showNote && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why? (optional — recorded in the decision log)"
          rows={2}
          className="w-full rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none"
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => submit(option)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
              TONES[option.tone ?? "quiet"]
            }`}
          >
            {armed === option.value
              ? "Tap again to confirm"
              : pending
                ? "Working…"
                : option.label}
          </button>
        ))}
      </div>

      {result && !result.ok && (
        <p className="mt-3 rounded-xl border border-poppy/30 bg-poppy/5 px-4 py-3 text-sm text-ink">
          {result.message}
        </p>
      )}
    </div>
  );
}
