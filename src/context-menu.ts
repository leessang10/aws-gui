import { language } from "./i18n";
import "./context-menu.css";
export type MenuAction = {
  label: string;
  run: () => void | Promise<void>;
  disabled?: boolean;
};
type Actions = () => MenuAction[];
const bindings = new WeakMap<HTMLElement, Actions>();
let menu: HTMLElement | undefined;
let previous: HTMLElement | null = null;
let observer: MutationObserver | undefined;
const tr = (ko: string, en: string) => (language === "ko" ? ko : en);
export function bindContextMenu(element: HTMLElement | null, actions: Actions) {
  if (element) bindings.set(element, actions);
}
export function closeContextMenu(restoreFocus = false) {
  menu?.remove();
  menu = undefined;
  observer?.disconnect();
  observer = undefined;
  if (restoreFocus && previous?.isConnected)
    previous.focus({ preventScroll: true });
  previous = null;
}
export async function copyText(value: unknown) {
  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    announce(tr("복사했습니다.", "Copied."));
  } catch {
    announce(
      tr(
        "복사하지 못했습니다. 텍스트를 선택한 뒤 Ctrl+C로 복사하세요.",
        "Could not copy. Select the text and press Ctrl+C.",
      ),
    );
  }
}
function announce(message: string) {
  document.getElementById("context-feedback")?.remove();
  const status = document.createElement("div");
  status.id = "context-feedback";
  status.className = "context-feedback";
  status.setAttribute("role", "status");
  status.textContent = message;
  document.body.append(status);
  setTimeout(() => status.remove(), 3500);
}
export const copyAction = (label: string, value: unknown): MenuAction => ({
  label,
  run: () => copyText(value),
});
function resolve(
  target: EventTarget | null,
): { element: HTMLElement; actions: MenuAction[] } | undefined {
  if (
    !(target instanceof Element) ||
    target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable=false]),[inert]",
    )
  )
    return;
  if (window.getSelection()?.toString()) return;
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const factory = bindings.get(el);
    if (factory) return { element: el, actions: factory() };
    if (el.tagName === "PRE")
      return {
        element: el,
        actions: [
          copyAction(tr("본문 전체 복사", "Copy full text"), el.textContent),
        ],
      };
  }
}
function open(
  element: HTMLElement,
  actions: MenuAction[],
  x: number,
  y: number,
  keyboard: boolean,
) {
  closeContextMenu();
  if (!actions.length) return;
  previous =
    keyboard && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : element.matches("button,[tabindex]")
        ? element
        : element.querySelector<HTMLElement>("button,[tabindex]");
  const popup = document.createElement("div");
  menu = popup;
  popup.className = "context-menu";
  popup.setAttribute("role", "menu");
  popup.setAttribute("aria-label", tr("항목 작업", "Item actions"));
  popup.tabIndex = -1;
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.disabled = !!action.disabled;
    button.textContent = action.label;
    button.onclick = () => {
      if (!element.isConnected || action.disabled) {
        closeContextMenu();
        return;
      }
      closeContextMenu(true);
      try {
        Promise.resolve(action.run()).catch(() =>
          announce(
            tr("작업을 완료하지 못했습니다.", "Action could not be completed."),
          ),
        );
      } catch {
        announce(
          tr("작업을 완료하지 못했습니다.", "Action could not be completed."),
        );
      }
    };
    popup.append(button);
  }
  // Keep the menu within an active modal so its parent is never inert.
  (element.closest('[role="dialog"]') ?? document.body).append(popup);
  const rect = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  popup.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  (
    popup.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? popup
  ).focus({ preventScroll: true });
  observer = new MutationObserver(() => {
    if (!element.isConnected || !popup.isConnected) closeContextMenu();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
document.addEventListener("contextmenu", (event) => {
  if (menu?.contains(event.target as Node)) {
    event.preventDefault();
    return;
  }
  const found = resolve(event.target);
  if (!found) {
    closeContextMenu();
    return;
  }
  event.preventDefault();
  const rect = found.element.getBoundingClientRect();
  open(
    found.element,
    found.actions,
    event.clientX || rect.left,
    event.clientY || rect.bottom,
    false,
  );
});
document.addEventListener(
  "keydown",
  (event) => {
    if (menu) {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeContextMenu(true);
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = [
          ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ];
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
        return;
      }
    }
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      const found = resolve(event.target);
      if (!found) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = found.element.getBoundingClientRect();
      open(found.element, found.actions, rect.left, rect.bottom, true);
    }
  },
  true,
);
document.addEventListener(
  "pointerdown",
  (event) => {
    if (menu && !menu.contains(event.target as Node)) closeContextMenu();
  },
  true,
);
document.addEventListener(
  "scroll",
  (event) => {
    if (menu && !(event.target instanceof Node && menu.contains(event.target)))
      closeContextMenu();
  },
  true,
);
window.addEventListener("resize", () => closeContextMenu(true));
window.addEventListener("blur", () => closeContextMenu());
