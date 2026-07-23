// Modal dialog host — the Preact equivalent of the `Modal` singleton in
// app/ui/js/components.js. A single <ModalHost/> lives at the app root; code
// calls `modal.alert / confirm / prompt / custom`, each returning a Promise.
// Reuses the exact CSS classes from app/ui (.modal-overlay/.modal/.modal-*).

import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Ico } from "@/lib/ico";

type CloseFn<T> = (value: T) => void;

interface ModalDef<T = unknown> {
  title: ComponentChildren;
  wide?: boolean;
  body: (close: CloseFn<T>) => ComponentChildren;
  foot?: (close: CloseFn<T>) => ComponentChildren;
  resolve: CloseFn<T>;
}

const current = signal<ModalDef | null>(null);
const queue: ModalDef[] = [];

function present(def: ModalDef) {
  if (current.value) queue.push(def);
  else current.value = def;
}

function closeCurrent(value: unknown) {
  const def = current.value;
  if (!def) return;
  current.value = null;
  def.resolve(value);
  if (queue.length) queueMicrotask(() => (current.value = queue.shift()!));
}

export const modal = {
  alert({ title, message, confirmText = "OK" }: { title: string; message: string; confirmText?: string }) {
    return new Promise<boolean>((resolve) => {
      present({
        title,
        resolve: resolve as CloseFn<unknown>,
        body: () => <p class="modal-msg">{message}</p>,
        foot: (close) => (
          <button class="btn btn-primary" type="button" onClick={() => close(true)}>
            {confirmText}
          </button>
        ),
      });
    });
  },

  confirm({
    title,
    message,
    confirmText = "Confirm",
    danger = false,
  }: {
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
  }) {
    return new Promise<boolean>((resolve) => {
      present({
        title,
        resolve: resolve as CloseFn<unknown>,
        body: () => <p class="modal-msg">{message}</p>,
        foot: (close) => (
          <>
            <button class="btn btn-ghost" type="button" onClick={() => close(false)}>
              Cancel
            </button>
            <button
              class={`btn ${danger ? "btn-danger" : "btn-primary"}`}
              type="button"
              onClick={() => close(true)}
            >
              {confirmText}
            </button>
          </>
        ),
      });
    });
  },

  prompt(opts: {
    title: string;
    label?: string;
    placeholder?: string;
    value?: string;
    confirmText?: string;
    validate?: (v: string) => string | null;
  }) {
    return new Promise<string | null>((resolve) => {
      present({
        title: opts.title,
        resolve: resolve as CloseFn<unknown>,
        body: (close) => <PromptBody opts={opts} close={close as CloseFn<string | null>} />,
        // footer is rendered inside PromptBody to share the input ref
      });
    });
  },

  custom<T = unknown>(opts: {
    title: ComponentChildren;
    wide?: boolean;
    body: (close: CloseFn<T>) => ComponentChildren;
    foot?: (close: CloseFn<T>) => ComponentChildren;
  }) {
    return new Promise<T>((resolve) => {
      present({
        title: opts.title,
        wide: opts.wide,
        resolve: resolve as CloseFn<unknown>,
        body: opts.body as (c: CloseFn<unknown>) => ComponentChildren,
        foot: opts.foot as ((c: CloseFn<unknown>) => ComponentChildren) | undefined,
      });
    });
  },
};

function PromptBody({
  opts,
  close,
}: {
  opts: {
    label?: string;
    placeholder?: string;
    value?: string;
    confirmText?: string;
    validate?: (v: string) => string | null;
  };
  close: CloseFn<string | null>;
}) {
  const [val, setVal] = useState(opts.value ?? "");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const submit = () => {
    const v = val.trim();
    const msg = opts.validate ? opts.validate(v) : v ? null : "This field is required.";
    if (msg) {
      setErr(msg);
      inputRef.current?.focus();
      return;
    }
    close(v);
  };

  return (
    <>
      {opts.label ? (
        <label class="modal-label" for="modalInput">
          {opts.label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        class="modal-input"
        id="modalInput"
        type="text"
        placeholder={opts.placeholder ?? ""}
        value={val}
        onInput={(e) => setVal((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot modal-foot-inline">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={submit}>
          {opts.confirmText ?? "OK"}
        </button>
      </div>
    </>
  );
}

export function ModalHost() {
  const def = current.value;
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!def) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCurrent(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [def]);

  if (!def) return null;
  const isPrompt = !def.foot; // prompt renders its own footer inside the body

  return (
    <div
      class="modal-overlay open"
      aria-hidden="false"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeCurrent(null);
      }}
    >
      <div
        ref={modalRef}
        class={`modal${def.wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div class="modal-head">
          <h2 class="modal-title">{def.title}</h2>
          <button
            class="btn btn-icon modal-close"
            type="button"
            title="Close"
            aria-label="Close"
            onClick={() => closeCurrent(null)}
          >
            <Ico name="x" />
          </button>
        </div>
        <div class="modal-body">{def.body(closeCurrent)}</div>
        {isPrompt ? null : <div class="modal-foot">{def.foot!(closeCurrent)}</div>}
      </div>
    </div>
  );
}
