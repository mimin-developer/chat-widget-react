import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ExternalLink, MessageCircleMore, X } from "lucide-react";

export interface OmniWidgetOptions {
  username: string;
  websiteId: string;
  appUrl: string;
  position?: "bottom-right" | "bottom-left" | "right" | "left";
  zIndex?: number;
  text?: string;
}

export interface OmniWidgetController {
  open(): void;
  close(): void;
  destroy(): void;
}

declare const __WIDGET_VERSION__: string;

interface Theme {
  buttonColor: string;
  buttonTextColor: string;
  iconSrc: string;
  title: string;
}

type WidgetLocale = "en" | "id";

const labels: Record<
  WidgetLocale,
  {
    open: string;
    close: string;
    back: string;
    survey: string;
    openNewTab: string;
  }
> = {
  en: {
    open: "Open chat",
    close: "Close chat",
    back: "Back to chat",
    survey: "Satisfaction survey",
    openNewTab: "Open in new tab",
  },
  id: {
    open: "Buka chat",
    close: "Tutup chat",
    back: "Kembali ke chat",
    survey: "Survei kepuasan",
    openNewTab: "Buka di tab baru",
  },
};

const csatPathPattern = /^\/csat\/(?!edit\/)[^/]+\/[^/]+\/?$/;

/** Returns the survey URL only when it is a public CSAT page on the platform app. */
function parseCsatUrl(value: unknown, appOrigin: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, appOrigin);
    return url.origin === appOrigin && csatPathPattern.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const defaultTheme: Theme = {
  buttonColor: "#0096a2",
  buttonTextColor: "#ffffff",
  iconSrc: "",
  title: "",
};

const visitorPattern =
  /^ow_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newVisitorId(): string {
  if (typeof crypto.randomUUID === "function")
    return `ow_${crypto.randomUUID()}`;
  // getRandomValues also works on HTTP embedding sites where randomUUID may be unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `ow_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: memory for this page only */
  }
}

function getSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode: memory for this page only */
  }
}

function normalizeText(text?: string): string | undefined {
  return text?.trim().slice(0, 500) || undefined;
}

function validColor(value: unknown, fallback: string): string {
  return typeof value === "string" && CSS.supports("color", value)
    ? value
    : fallback;
}

function validImage(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normalizeTheme(value: unknown): Theme {
  if (!value || typeof value !== "object") return defaultTheme;
  const data = value as Record<string, unknown>;
  return {
    buttonColor: validColor(data.buttonColor, defaultTheme.buttonColor),
    buttonTextColor: validColor(
      data.buttonTextColor,
      defaultTheme.buttonTextColor,
    ),
    iconSrc: validImage(data.iconSrc),
    title:
      typeof data.title === "string"
        ? data.title.slice(0, 100)
        : defaultTheme.title,
  };
}

/** Normalize the public position value to internal 'left' | 'right'. */
function normPos(pos: OmniWidgetOptions["position"]): "left" | "right" {
  return pos === "left" || pos === "bottom-left" ? "left" : "right";
}

function Widget({
  options,
  appOrigin,
  visitorId,
  greetingSeen,
  storagePrefix,
  host,
  text,
}: {
  options: OmniWidgetOptions;
  appOrigin: string;
  visitorId: string;
  greetingSeen: boolean;
  storagePrefix: string;
  host: HTMLElement;
  text?: string;
}) {
  const [open, setOpen] = useState(host.dataset.open === "true");
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [ready, setReady] = useState(false);
  const [csatUrl, setCsatUrl] = useState<string | null>(null);
  const [locale, setLocale] = useState<WidgetLocale>(() => {
    const saved = getStored(`${storagePrefix}:locale`);
    if (saved === "id" || saved === "en") return saved;
    return navigator.language.toLowerCase().startsWith("id") ? "id" : "en";
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const localeRef = useRef(locale);
  const textRef = useRef(text);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  const title = theme.title;

  const frameUrl = useMemo(() => {
    const url = new URL(
      `/web-chat/embed/${encodeURIComponent(options.username)}`,
      appOrigin,
    );
    url.searchParams.set("website_id", options.websiteId);
    url.searchParams.set("visitor_id", visitorId);
    if (greetingSeen) url.searchParams.set("greeting_seen", "1");
    // Tells the chat page it may hand CSAT links to this widget (older widgets lack this).
    url.searchParams.set("csat_inline", "1");
    const trimmedText = normalizeText(text);
    if (trimmedText) url.searchParams.set("text", trimmedText);
    return url.href;
  }, [
    appOrigin,
    options.username,
    options.websiteId,
    visitorId,
    greetingSeen,
    text,
  ]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      setOpen(next);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== appOrigin ||
        event.source !== iframeRef.current?.contentWindow
      )
        return;
      if (event.data?.type === "chatwidget:omni:greeting-seen") {
        setStored(`${storagePrefix}:greeting`, "1");
      } else if (event.data?.type === "chatwidget:omni:text-sent") {
        // Applies on the next load; reloading the iframe mid-chat would reset it.
        const sent = normalizeText(textRef.current);
        if (sent) setSession(`${storagePrefix}:text-sent`, sent);
      } else if (event.data?.type === "chatwidget:omni:csat-open") {
        const next = parseCsatUrl(event.data.url, appOrigin);
        if (next) setCsatUrl(next);
      } else if (event.data?.type === "chatwidget:omni:locale-set") {
        if (event.data.locale === "id" || event.data.locale === "en") {
          setStored(`${storagePrefix}:locale`, event.data.locale);
          // The chat page sends `theme` right after `locale-set`; answering it before React
          // commits would echo the old language back and make the two sides flip forever.
          localeRef.current = event.data.locale;
          setLocale(event.data.locale);
        }
      } else if (event.data?.type === "chatwidget:omni:locale-ready") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "chatwidget:omni:locale-apply", locale: localeRef.current },
          appOrigin,
        );
      } else if (event.data?.type === "chatwidget:omni:theme") {
        setTheme(normalizeTheme(event.data.theme));
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "chatwidget:omni:locale-apply", locale: localeRef.current },
          appOrigin,
        );
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    host.addEventListener("chatwidget:omni:control", onControl);
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      host.removeEventListener("chatwidget:omni:control", onControl);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [appOrigin, host, storagePrefix]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
  };

  const backToChat = () => {
    setCsatUrl(null);
    // The chat frame is inert until React commits; focus it afterwards.
    requestAnimationFrame(() => iframeRef.current?.focus());
  };

  return (
    <div
      className={`omni-widget omni-widget--${normPos(options.position)}${open && ready ? " omni-widget--open" : ""}`}
      style={{
        [normPos(options.position) === "left" ? "left" : "right"]: "20px",
        zIndex: options.zIndex ?? 2147483000,
      }}
    >
      <motion.section
        className="omni-panel"
        role="dialog"
        aria-label={title || labels[locale].open}
        aria-hidden={!open || !ready}
        inert={!open || !ready}
        initial={
          reduceMotion
            ? false
            : { opacity: 0, y: 14, scale: 0.96, visibility: "hidden" }
        }
        animate={
          open && ready
            ? { opacity: 1, y: 0, scale: 1, visibility: "visible" }
            : {
                opacity: 0,
                y: 14,
                scale: 0.96,
                transitionEnd: { visibility: "hidden" },
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: open && ready ? 0.28 : 0.18, ease: [0.16, 1, 0.3, 1] }
        }
        style={{ pointerEvents: open && ready ? "auto" : "none" }}
      >
        <button
          type="button"
          className="omni-close"
          aria-label={labels[locale].close}
          onClick={toggle}
        >
          <X aria-hidden="true" size={16} strokeWidth={2} />
        </button>
        <iframe
          className="omni-chat-frame"
          ref={iframeRef}
          src={frameUrl}
          title={title || labels[locale].open}
          allow="clipboard-write"
          inert={!!csatUrl}
          aria-hidden={!!csatUrl}
        />
        <AnimatePresence>
          {csatUrl && (
            <motion.div
              key="csat"
              className="omni-csat"
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: 24 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <div className="omni-csat-bar">
                <button
                  type="button"
                  className="omni-csat-back"
                  style={{ color: theme.buttonColor }}
                  onClick={backToChat}
                >
                  <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.25} />
                  {labels[locale].back}
                </button>
                <a
                  className="omni-csat-newtab"
                  href={csatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={labels[locale].openNewTab}
                  title={labels[locale].openNewTab}
                >
                  <ExternalLink aria-hidden="true" size={15} strokeWidth={2} />
                </a>
              </div>
              <iframe
                className="omni-csat-frame"
                src={csatUrl}
                title={labels[locale].survey}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
      {ready && (
        <motion.button
          type="button"
          className={`omni-launcher${title && !open ? " omni-launcher--titled" : ""}`}
          style={{
            backgroundColor: theme.buttonColor,
            color: theme.buttonTextColor,
          }}
          whileHover={reduceMotion ? undefined : { scale: 1.06 }}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.18 }}
          aria-label={
            open ? labels[locale].close : title || labels[locale].open
          }
          aria-expanded={open}
          title={open ? labels[locale].close : title || labels[locale].open}
          onClick={toggle}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "chat"}
              className="omni-launcher-content"
              initial={
                reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.75 }
              }
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, rotate: 35, scale: 0.75 }
              }
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
            >
              {open ? (
                <X aria-hidden="true" size={22} strokeWidth={2} />
              ) : (
                <>
                  {theme.iconSrc ? (
                    <img
                      className="omni-launcher-image"
                      src={theme.iconSrc}
                      alt=""
                    />
                  ) : (
                    <MessageCircleMore
                      aria-hidden="true"
                      size={23}
                      strokeWidth={1.9}
                    />
                  )}
                  {title && (
                    <span className="omni-launcher-label">{title}</span>
                  )}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      )}
    </div>
  );
}

let mounted: { root: Root; host: HTMLElement } | null = null;

function control(open: boolean) {
  if (!mounted) return;
  mounted.host.dataset.open = String(open);
  mounted.host.dispatchEvent(
    new CustomEvent("chatwidget:omni:control", { detail: open }),
  );
}

function destroy() {
  if (!mounted) return;
  mounted.root.unmount();
  mounted.host.remove();
  mounted = null;
}

export const OmniWidget = {
  init(options: OmniWidgetOptions): OmniWidgetController {
    if (
      !options?.username?.trim() ||
      !options.websiteId?.trim() ||
      !options.appUrl?.trim()
    ) {
      throw new Error(
        "OmniWidget.init requires username, websiteId, and appUrl",
      );
    }
    const appUrl = new URL(options.appUrl);
    if (!["http:", "https:"].includes(appUrl.protocol))
      throw new Error("appUrl must be an HTTP(S) URL");
    destroy();

    const storagePrefix = `chatwidget:omni:${appUrl.host}:${options.username}:${options.websiteId}`;
    const storedId = getStored(`${storagePrefix}:visitor`);
    const visitorId =
      storedId && visitorPattern.test(storedId) ? storedId : newVisitorId();
    setStored(`${storagePrefix}:visitor`, visitorId);
    const greetingSeen = getStored(`${storagePrefix}:greeting`) === "1";

    const host = document.createElement("div");
    host.id = "chatwidget-omni";
    host.dataset.open = "false";
    const shadow = host.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = import.meta.env.DEV
      ? new URL("./widget.css?direct", import.meta.url).href
      : new URL(
          `/omnichannel-widget/v${__WIDGET_VERSION__}/omnichannel.css`,
          appUrl.origin,
        ).href;
    const container = document.createElement("div");
    shadow.append(stylesheet, container);
    document.body.append(host);
    const root = createRoot(container);
    const instance = { root, host };
    mounted = instance;
    const rawText =
      typeof options.text === "string" ? options.text : undefined;
    const alreadySent =
      !!rawText &&
      getSession(`${storagePrefix}:text-sent`) === normalizeText(rawText);
    const initText = alreadySent ? undefined : rawText;
    root.render(
      <Widget
        options={options}
        appOrigin={appUrl.origin}
        visitorId={visitorId}
        greetingSeen={greetingSeen}
        storagePrefix={storagePrefix}
        host={host}
        text={initText}
      />,
    );

    return {
      open: () => {
        if (mounted === instance) control(true);
      },
      close: () => {
        if (mounted === instance) control(false);
      },
      destroy: () => {
        if (mounted === instance) destroy();
      },
    };
  },
  open: () => control(true),
  close: () => control(false),
  destroy,
};

// A plain external module tag works on hosts that disallow inline scripts.
// Manual `import { OmniWidget } ...; OmniWidget.init(...)` remains supported.
if (typeof document !== "undefined") {
  const script = Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="module"][data-omni-username][data-omni-website-id][data-omni-app-url]',
    ),
  ).find((element) => element.src === import.meta.url);
  if (script) {
    const rawPos = script.dataset.omniPosition;
    OmniWidget.init({
      username: script.dataset.omniUsername || "",
      websiteId: script.dataset.omniWebsiteId || "",
      appUrl: script.dataset.omniAppUrl || "",
      position:
        rawPos === "bottom-left" ||
        rawPos === "bottom-right" ||
        rawPos === "left" ||
        rawPos === "right"
          ? rawPos
          : undefined,
      text: script.dataset.omniText,
    });
  }
}
