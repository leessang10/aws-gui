const paths: Record<string, string> = {
  topology:
    '<rect x="8" y="2" width="8" height="5"/><path d="M12 7v5M4 12h16M4 12v4m16-4v4"/><rect x="1" y="16" width="6" height="5"/><rect x="17" y="16" width="6" height="5"/>',
  elb: '<path d="M3 12h6m0 0 6-7m-6 7 6 7m-6-7h9"/><circle cx="3" cy="12" r="2"/><rect x="16" y="2" width="5" height="5"/><rect x="18" y="10" width="5" height="5"/><rect x="16" y="17" width="5" height="5"/>',
  lambda: '<path d="M5 3h5l8 18h4M8 10 2 21h6l3-6"/>',
  sqs: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9v6m6-6v6m6-6v6"/>',
  sns: '<circle cx="5" cy="12" r="3"/><path d="m8 12 9-7m-9 7h9m-9 0 9 7"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="19" cy="19" r="2"/>',
  events:
    '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  ip: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18 6-5 6-13 0-18Z"/>',
  targetResource:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
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
