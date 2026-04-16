import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Collect every accessible stylesheet rule as a single CSS blob — used to
 *  inline the app's styles into the temp HTML opened by the macOS fallback. */
function collectInlineStyles(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(sheet.cssRules)) rules.push(r.cssText);
    } catch {
      // Cross-origin sheet — ignore; Tauri-served assets should be same-origin.
    }
  }
  return rules.join("\n");
}

/** macOS WKWebView workaround: write the current page's print view to a temp
 *  HTML file and open it in the default browser (Safari), where window.print()
 *  works natively. The temp page auto-invokes print on load. */
async function printViaBrowserFallback(): Promise<void> {
  const styles = collectInlineStyles();
  const body = document.body.innerHTML;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Taxeasy</title>
<style>${styles}</style>
<style>
  @page {
    margin: 0.5in 0.5in 0.75in 0.5in;
    @bottom-right { content: counter(page); font-size: 9pt; color: #6b7280; }
  }
  body { background: white; color: #0f172a; }
  /* Hide elements the app flags as screen-only. */
  .print\\:hidden, nav, [role="toolbar"] { display: none !important; }
</style>
<script>
  window.addEventListener('load', () => setTimeout(() => window.print(), 250));
</script>
</head>
<body>${body}</body>
</html>`;
  await invoke("print_html", { html });
}

/**
 * Prints the active report.
 *
 * - Windows (WebView2) / Linux: uses window.print() directly with an injected
 *   @page rule to strip browser-default headers/footers.
 * - macOS (WKWebView): writes a temp HTML snapshot and opens it in the default
 *   browser. WKWebView in Tauri v2 doesn't implement window.print().
 */
export function triggerPrint() {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform ?? navigator.userAgent ?? "");
  if (isMac) {
    void printViaBrowserFallback();
    return;
  }

  const tauriWin = getCurrentWindow();
  const prevDocTitle = document.title;

  let style: HTMLStyleElement | null = null;

  function onBeforePrint() {
    // Blank the document title at the last possible moment
    document.title = "";
    void tauriWin.setTitle(" ");

    // Inject @page margin-box CSS inside beforeprint so the print engine
    // sees it immediately — no requestAnimationFrame timing race.
    style = document.createElement("style");
    style.dataset.printOverride = "1";
    style.textContent = `
      @page {
        margin: 0.5in 0.5in 0.75in 0.5in;
        @top-left    { content: ' '; }
        @top-center  { content: ' '; }
        @top-right   { content: ' '; }
        @bottom-left { content: ' '; }
        @bottom-center { content: ' '; }
        @bottom-right {
          content: counter(page);
          font-size: 9pt;
          color: #6b7280;
          font-family: system-ui, -apple-system, sans-serif;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function onAfterPrint() {
    document.title = prevDocTitle;
    void tauriWin.setTitle("Taxeasy");
    style?.remove();
    style = null;
  }

  window.addEventListener("beforeprint", onBeforePrint, { once: true });
  window.addEventListener("afterprint", onAfterPrint, { once: true });

  window.print();
}
