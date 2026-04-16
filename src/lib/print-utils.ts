import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Prints the active report with no browser-injected headers or footers.
 *
 * Strategy:
 *  - Listen for the browser's own `beforeprint` event, which fires at the
 *    exact instant the print engine reads styles. Injecting CSS there (rather
 *    than before calling window.print) guarantees the rules are live when the
 *    print renderer evaluates @page.
 *  - Use content: ' ' (single space) for all margin boxes we want empty.
 *    This explicitly replaces the browser's default title / date / URL with
 *    invisible whitespace, which is more reliable across WebView2 versions
 *    than `content: none`.
 *  - Blank both document.title and the native Tauri window title so neither
 *    can appear in the header even if the margin-box approach is ignored.
 *  - `afterprint` restores everything and removes the injected style.
 */
export function triggerPrint() {
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
