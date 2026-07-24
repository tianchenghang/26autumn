import { render } from "preact";
import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import { LocationProvider, Router, Route } from "preact-iso";
import { Lock, X } from "lucide-preact";
import { DocsProvider, DocsLayout } from "@swifty.js/docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";
import { decryptContent } from "./guard";
import "./main.css";

type PageModule = { pageData: any; contentHtml: string };

const DENIED_HTML = `
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:45vh;gap:1rem;text-align:center;font-family:inherit;">
  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.35">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/>
  </svg>
  <div>
    <p style="font-size:1.15rem;font-weight:700;margin:0 0 0.4rem;">你没有权限</p>
    <p style="font-size:0.85rem;opacity:0.55;margin:0;">此页面受密码保护，请输入正确密码后查看</p>
  </div>
</div>`;

let askUnlockFn: ((payload: any) => Promise<string | null>) | null = null;

function parsePayload(html: string) {
  try {
    const obj = JSON.parse(html);
    if (obj && typeof obj.encrypted === "string" && obj.salt && obj.iv)
      return obj;
  } catch {}
  return null;
}

async function guardedLoadContent(path: string): Promise<PageModule | null> {
  const mod = await loadContent(path);
  if (!mod) return null;

  const payload = parsePayload(mod.contentHtml);
  if (!payload) return mod;

  const cached = sessionStorage.getItem("docs-guard-pwd");
  if (cached) {
    try {
      const html = await decryptContent(payload, cached);
      return { ...mod, contentHtml: html };
    } catch {
      sessionStorage.removeItem("docs-guard-pwd");
    }
  }

  const html = await askUnlockFn!(payload);
  if (html === null) return { ...mod, contentHtml: DENIED_HTML };
  return { ...mod, contentHtml: html };
}

function PasswordDialog({
  payload,
  onUnlock,
  onClose,
}: {
  payload: any;
  onUnlock: (html: string, pwd: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: Event) => {
      e.preventDefault();
      if (!value.trim() || checking) return;
      setChecking(true);
      try {
        const html = await decryptContent(payload, value);
        onUnlock(html, value);
      } catch {
        setError("密码错误, 请重试");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setChecking(false);
        inputRef.current?.select();
      }
    },
    [value, checking, payload, onUnlock],
  );

  return (
    <div
      class="animate-guard-fade fixed inset-0 z-999 flex items-center justify-center bg-black/45 backdrop-blur-[6px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        class={`border-border bg-card text-card-foreground relative w-85 rounded-xl border p-8 shadow-[var(--sakura-shadow-lift)] ${
          shake ? "animate-guard-shake" : "animate-guard-pop"
        }`}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          class="text-muted-foreground hover:bg-muted absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md opacity-60 transition-all duration-150 hover:opacity-100"
        >
          <X size={15} />
        </button>

        <div class="border-border bg-accent text-primary mb-5 flex h-12 w-12 items-center justify-center rounded-lg border">
          <Lock size={24} stroke-width={1.5} />
        </div>

        <h3 class="text-[1.05rem] font-bold tracking-tight">
          此页面受密码保护
        </h3>
        <p class="text-muted-foreground mt-1 mb-5 text-[0.82rem]">
          请输入密码以查看内容
        </p>

        <input
          ref={inputRef}
          type="password"
          value={value}
          onInput={(e) => {
            setValue((e.target as HTMLInputElement).value);
            setError("");
          }}
          placeholder="密码"
          class={`bg-input/50 placeholder:text-muted-foreground/60 w-full rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 outline-none ${
            error
              ? "border-destructive focus:border-destructive"
              : "border-border focus:border-ring focus:ring-ring/20 focus:ring-2"
          }`}
        />
        {error && (
          <p class="text-destructive mt-2 text-[0.78rem] font-medium">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={checking}
          class="bg-primary text-primary-foreground mt-5 w-full rounded-md py-2.5 text-sm font-semibold transition-all duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "验证中..." : "解锁"}
        </button>
      </form>
    </div>
  );
}

function App() {
  const [dialog, setDialog] = useState<{ payload: any } | null>(null);
  const resolveRef = useRef<((html: string | null) => void) | null>(null);

  askUnlockFn = useCallback((payload: any): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ payload });
    });
  }, []);

  const handleUnlock = useCallback((html: string, pwd: string) => {
    sessionStorage.setItem("docs-guard-pwd", pwd);
    setDialog(null);
    resolveRef.current?.(html);
    resolveRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setDialog(null);
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, []);

  return (
    <>
      {dialog && (
        <PasswordDialog
          payload={dialog.payload}
          onUnlock={handleUnlock}
          onClose={handleClose}
        />
      )}
      <DocsProvider
        config={docsConfig}
        loadContent={guardedLoadContent}
        getSearchIndex={getSearchIndex}
      >
        <LocationProvider>
          <Router>
            <Route path="/" component={DocsLayout} />
            <Route default component={DocsLayout} />
          </Router>
        </LocationProvider>
      </DocsProvider>
    </>
  );
}

render(<App />, document.getElementById("app")!);
