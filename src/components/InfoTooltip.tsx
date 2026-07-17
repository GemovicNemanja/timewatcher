import { useId, useRef } from "react";

type PopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

type Props = {
  label: string;
  children: string;
};

export function InfoTooltip({ label, children }: Props) {
  const id = `info-${useId().replaceAll(":", "")}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<PopoverElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anchor = `--${id}`;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const positionFallback = () => {
    if (typeof CSS !== "undefined" && CSS.supports?.("anchor-name: --a")) return;
    const button = buttonRef.current;
    const tip = popoverRef.current;
    if (!button || !tip) return;
    const rect = button.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - 300, Math.max(12, rect.left - 16))}px`;
    tip.style.top = `${rect.bottom + 8}px`;
  };

  const open = () => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      positionFallback();
      popoverRef.current?.showPopover?.();
    }, 150);
  };

  const close = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => popoverRef.current?.hidePopover?.(), 120);
  };

  const buttonProps = { popovertarget: id } as Record<string, string>;
  const popoverProps = { popover: "auto" } as Record<string, string>;

  return (
    <span className="info-wrap">
      <button
        {...buttonProps}
        ref={buttonRef}
        className="info-button"
        type="button"
        aria-label={`What does ${label.toLowerCase()} mean?`}
        aria-describedby={id}
        onPointerEnter={open}
        onPointerLeave={close}
        onFocus={open}
        onBlur={close}
        style={{ anchorName: anchor } as React.CSSProperties}
      >
        ⓘ
      </button>
      <div
        {...popoverProps}
        ref={popoverRef}
        id={id}
        className="info-tip"
        role="tooltip"
        onPointerEnter={clearTimers}
        onPointerLeave={close}
        style={{ positionAnchor: anchor } as React.CSSProperties}
      >
        {children}
      </div>
    </span>
  );
}
