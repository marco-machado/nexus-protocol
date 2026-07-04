const LINE_MS = 6000;
const MAX_LINES = 3;

export interface Comms {
  push(line: string): void;
  dispose(): void;
}

export function createComms(): Comms {
  const el = document.createElement('div');
  el.className = 'comms';
  document.body.appendChild(el);
  let disposed = false;

  return {
    push(line) {
      if (disposed) return;
      const div = document.createElement('div');
      div.className = 'commline';
      div.textContent = `NEXUS OPS // ${line}`;
      el.appendChild(div);
      while (el.children.length > MAX_LINES) el.firstChild?.remove();
      setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 600);
      }, LINE_MS);
    },
    dispose() {
      disposed = true;
      el.remove();
    },
  };
}
