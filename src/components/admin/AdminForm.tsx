"use client";

// FILE: src/components/admin/AdminForm.tsx
//
// Shared form primitives for the admin panel.
//
// Deliberate choices:
//
// - Results are shown inline and persist. Admin actions fail for real reasons
//   ("this product is in 3 orders"), and a toast that vanishes after two
//   seconds is the wrong place to explain that.
//
// - Destructive actions arm on first click and fire on second. Deleting a
//   product or refunding an order should not happen from one mis-tap.

import { useState, useTransition } from "react";

export type Result = { ok: boolean; message: string };

function Feedback({ result }: { result: Result | null }) {
  if (!result) return null;

  return (
    <p
      className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
        result.ok
          ? "border-sage/40 bg-sage/10 text-ink"
          : "border-poppy/30 bg-poppy/5 text-ink"
      }`}
    >
      {result.message}
    </p>
  );
}

/// A full form whose fields are supplied as children.
export function AdminForm({
  action,
  children,
  submitLabel = "Save",
  hidden = {},
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  submitLabel?: string;
  hidden?: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        for (const [key, value] of Object.entries(hidden)) {
          formData.set(key, value);
        }
        startTransition(async () => {
          try {
            setResult(await action(formData));
          } catch (error) {
            setResult({
              ok: false,
              message:
                error instanceof Error ? error.message : "Something went wrong.",
            });
          }
        });
      }}
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-full bg-poppy px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      <Feedback result={result} />
    </form>
  );
}

/// A single button that submits fixed values. Used for status changes.
export function ActionButton({
  action,
  values,
  label,
  tone = "quiet",
  confirm = false,
}: {
  action: (formData: FormData) => Promise<Result>;
  values: Record<string, string>;
  label: string;
  tone?: "primary" | "danger" | "quiet";
  confirm?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [armed, setArmed] = useState(false);

  const tones: Record<string, string> = {
    primary: "bg-poppy text-white hover:opacity-90",
    danger: "border border-poppy/40 text-poppy hover:bg-poppy/5",
    quiet: "border border-ink/15 text-ink-soft hover:bg-cream-soft",
  };

  return (
    <span className="inline-block">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          startTransition(async () => {
            const formData = new FormData();
            for (const [key, value] of Object.entries(values)) {
              formData.set(key, value);
            }
            try {
              setResult(await action(formData));
            } catch (error) {
              setResult({
                ok: false,
                message:
                  error instanceof Error
                    ? error.message
                    : "Something went wrong.",
              });
            }
          });
        }}
        className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${tones[tone]}`}
      >
        {armed ? "Tap again to confirm" : pending ? "Working…" : label}
      </button>
      <Feedback result={result} />
    </span>
  );
}

/// Compact inline number editor, used for stock in list views.
export function InlineNumber({
  action,
  values,
  field,
  initial,
  label,
  suffix,
}: {
  action: (formData: FormData) => Promise<Result>;
  values: Record<string, string>;
  field: string;
  initial: number;
  label: string;
  suffix?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(initial));
  const [result, setResult] = useState<Result | null>(null);

  const dirty = value !== String(initial);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          aria-label={label}
          onChange={(event) => setValue(event.target.value)}
          className="w-24 rounded-lg border border-ink/15 bg-cream-soft px-2 py-1 text-sm text-ink focus:border-ink/30 focus:outline-none"
        />
        {suffix && (
          <span className="text-[11px] text-ink-soft">{suffix}</span>
        )}
        {dirty && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const formData = new FormData();
                for (const [key, entry] of Object.entries(values)) {
                  formData.set(key, entry);
                }
                formData.set(field, value);
                try {
                  setResult(await action(formData));
                } catch {
                  setResult({ ok: false, message: "Could not save." });
                }
              })
            }
            className="rounded-full bg-poppy px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "…" : "Save"}
          </button>
        )}
      </div>
      {result && (
        <p
          className={`mt-1 text-[11px] ${
            result.ok ? "text-ink-soft" : "text-poppy"
          }`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}

export const fieldClass =
  "w-full rounded-xl border border-ink/15 bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-ink/30 focus:outline-none";

export const labelClass =
  "block font-tag text-[10px] uppercase tracking-[0.12em] text-ink-soft";
