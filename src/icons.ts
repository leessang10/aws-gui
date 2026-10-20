const paths: Record<string, string> = {
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z"/>',
  ec2: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6"/>',
  rds: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  s3: '<path d="M4 6h16l-2 15H6L4 6Zm-1 0h18M8 3h8"/><path d="M9 11h6"/>',
  logs: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export const icon = (name: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.logs}</svg>`;
