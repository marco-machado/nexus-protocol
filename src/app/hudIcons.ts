const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">${body}</g></svg>`;

export const ORDER_ICONS: Record<string, string> = {
  move: svg(
    '<path d="M12 2l3.2 4.2h-2.1v3.7h3.7V7.8L21 11l-4.2 3.2v-2.1h-3.7v3.7h2.1L12 20l-3.2-4.2h2.1v-3.7H7.2v2.1L3 11l4.2-3.2v2.1h3.7V6.2H8.8z"/>',
  ),
  attack: svg(
    '<path d="M11 1h2v4.2h-2zM11 18.8h2V23h-2zM1 11h4.2v2H1zM18.8 11H23v2h-4.2z"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.8"/>',
  ),
  hold: svg('<path d="M12 2l8 3v6.2c0 4.9-3.3 9-8 10.8-4.7-1.8-8-5.9-8-10.8V5z"/>'),
  stim: svg('<path d="M13.4 2 5 13.4h4.8L8.2 22l8.7-12.4h-4.8z"/>'),
  persuade: svg(
    '<circle cx="12" cy="12" r="2.3"/><path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  ),
  swarm: svg(
    '<circle cx="6.2" cy="8" r="2.3"/><circle cx="12" cy="4.8" r="2.3"/><circle cx="17.8" cy="8" r="2.3"/><circle cx="9" cy="13.6" r="2.3"/><circle cx="15" cy="13.6" r="2.3"/><path d="M11 16.6h2V22l-3.4-2.6z"/>',
  ),
  cycle: svg(
    '<path d="M12 5.2V2l5 4-5 4V6.9a5.1 5.1 0 0 0-4.9 6.3H5A7 7 0 0 1 12 5.2z"/><path d="M12 18.8V22l-5-4 5-4v3.1a5.1 5.1 0 0 0 4.9-6.3H19a7 7 0 0 1-7 8z"/>',
  ),
  sweep: svg(
    '<path d="M3 12l6-4v2.6h4v2.8H9V16z"/><circle cx="17" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 7h2v2h-2zM16 15h2v2h-2zM12.4 11h2v2h-2zM19.6 11h2v2h-2z"/>',
  ),
};

// silhouettes indexed by weapon id (src/sim/weapons.ts order)
export const WEAPON_ICONS: string[] = [
  svg('<path d="M3 9h14v3.2h-5.4l-1 4.8H6.4l1.2-4.8H3z"/><path d="M17 9.6h4v2h-4z"/>'),
  svg('<path d="M2 10.6h16v2.2H2z"/><path d="M18 9.8h4v3.8h-4z"/><path d="M6.4 12.8 5.2 17h3l1.2-4.2z"/><path d="M9 8.6h6v1.4H9z"/>'),
  svg('<path d="M3 9h13v3.2h-4.2v1.6H8.6v-1.6H3z"/><path d="M16 9.8h5.4v1.8H16z"/><path d="M9.4 13.8h3v4.8h-3z"/>'),
  svg('<path d="M2 11.4h20v1.7H2z"/><path d="M8 8.8h5.4v1.8H8z"/><path d="M5.4 13.1 4.2 17.4h3.2l1.2-4.3z"/>'),
  svg('<path d="M2 8.6h13.4v1.6H2zM2 11.2h13.4v1.6H2zM2 13.8h13.4v1.6H2z"/><path d="M15.4 7.6h6.2v8.8h-6.2z"/>'),
  svg('<path d="M15.4 6.8h5.4v10.4h-5.4z"/><path d="M3.4 10.8h12v2.4h-12z"/><path d="M3.4 13.2c-2.4 1.2-2.4-3.6 0-2.4z"/><path d="M17 4.6h2.2v2.2H17z"/>'),
  svg('<path d="M2 11.4h19v1.7H2z"/><circle cx="8" cy="12.2" r="1.9" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12.6" cy="12.2" r="1.9" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.8 13.1 3.6 17.4h3.2L8 13.1z"/>'),
  svg('<path d="M2 9.8h17v4.4H2z"/><circle cx="19.4" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 14.2 3 18h3l1-3.8z"/>'),
  svg('<path d="M2 11.5h16v1.5H2z"/><circle cx="20" cy="12.2" r="2.6"/><path d="M6 9.4h6v1.6H6z"/><path d="M5 13 4 17h3l1-4z"/>'),
  svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M11 3h2v5h-2zM11 16h2v5h-2zM3 11h5v2H3zM16 11h5v2h-5z"/><circle cx="12" cy="12" r="2"/>'),
];

export const WEAPON_ICON_FALLBACK = svg('<path d="M3 10h15v4H3z"/><path d="M18 9h3v6h-3z"/>');

export const UI_ICONS = {
  pause: svg('<path d="M7 4h3.4v16H7zM13.6 4H17v16h-3.4z"/>'),
  play: svg('<path d="M7 4l12 8-12 8z"/>'),
  help: svg(
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/><path d="M11 15.6h2v2.2h-2zM12 6.6c-2 0-3.4 1.2-3.6 3h2c.1-.8.7-1.3 1.6-1.3.9 0 1.5.5 1.5 1.2 0 .6-.3.9-1.2 1.5-1 .7-1.4 1.3-1.4 2.6h2c0-.7.2-1 1.1-1.6 1-.7 1.6-1.4 1.6-2.6 0-1.7-1.4-2.8-3.6-2.8z"/>',
  ),
  menu: svg('<path d="M3 5h18v2.4H3zM3 10.8h18v2.4H3zM3 16.6h18V19H3z"/>'),
};
