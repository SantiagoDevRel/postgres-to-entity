/** One accessible, dismissible help bubble. No source data is interpreted as markup. */
let sequence = 0;
let dismiss: (() => void) | undefined;

export function help(label: string, explanation: string) {
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'help-trigger';
  trigger.textContent = '?'; trigger.setAttribute('aria-label', 'About ' + label);
  trigger.setAttribute('aria-expanded', 'false');
  const bubble = document.createElement('div');
  bubble.id = 'help-' + ++sequence; bubble.className = 'help-bubble';
  bubble.role = 'tooltip'; bubble.textContent = explanation;
  trigger.setAttribute('aria-describedby', bubble.id);
  let open = false;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    // Use viewport coordinates even at CSS zoom. The body-level bubble avoids clipped panels.
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    bubble.style.width = Math.min(344, (innerWidth - 32) / zoom) + 'px';
    bubble.style.maxHeight = (innerHeight - 16) / zoom + 'px';
    const bounds = bubble.getBoundingClientRect();
    const left = Math.max(16, Math.min(rect.left, innerWidth - bounds.width - 16));
    const top = rect.bottom + 8 + bounds.height < innerHeight
      ? rect.bottom + 8 : Math.max(8, rect.top - bounds.height - 8);
    bubble.style.left = left / zoom + 'px'; bubble.style.top = top / zoom + 'px';
  };
  const close = () => {
    clearTimeout(leaveTimer);
    open = false; bubble.remove(); trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    if (dismiss === close) dismiss = undefined;
  };
  const outside = (event: PointerEvent) => {
    if (event.target !== trigger && !bubble.contains(event.target as Node)) close();
  };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  const show = () => {
    clearTimeout(leaveTimer);
    if (open) return;
    dismiss?.(); open = true; dismiss = close;
    document.body.append(bubble); trigger.setAttribute('aria-expanded', 'true'); position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
  };
  trigger.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(); });
  trigger.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && event.relatedTarget !== bubble && document.activeElement !== trigger)
      leaveTimer = setTimeout(close, 180);
  });
  bubble.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
  bubble.addEventListener('pointerleave', () => { if (document.activeElement !== trigger) close(); });
  trigger.addEventListener('focus', show);
  trigger.addEventListener('blur', close);
  // A click keeps focus-open help visible on touch; Escape or an outside tap dismisses it.
  trigger.addEventListener('click', show);
  trigger.addEventListener('keydown', event => {
    if (!open || bubble.scrollHeight <= bubble.clientHeight) return;
    const distance = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40
      : event.key === 'PageDown' ? bubble.clientHeight : event.key === 'PageUp' ? -bubble.clientHeight : 0;
    if (distance) { event.preventDefault(); bubble.scrollBy(0, distance); }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); bubble.scrollTop = event.key === 'Home' ? 0 : bubble.scrollHeight;
    }
  });
  return trigger;
}

export function closeHelp() { dismiss?.(); }

export function installHelp() {
  document.querySelectorAll<HTMLElement>('[data-help]').forEach(host => {
    host.append(help(host.dataset.helpLabel ?? host.textContent ?? '', host.dataset.help!));
  });
}
