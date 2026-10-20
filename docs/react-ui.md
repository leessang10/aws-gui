# React UI migration

The app uses one React 19 root, TypeScript, shadcn/ui (Radix), Tailwind CSS 4 and Lucide. Rust commands and AWS CLI execution policy are unchanged.

- `app.tsx`: shell, profile/region context, bounded resource cache and resource lists.
- `pages.tsx`: service catalog, settings, details, guided actions and API workbench.
- `explorer-view.tsx`: paginated S3 browsing and CloudWatch events.
- `shared-ui.tsx`: headings, errors, JSON viewer, context menus and service icons.
- `components/ui`: checked-in shadcn components; customize these rather than adding a second UI system.
- `styles.css`: semantic color, radius and typography tokens.
- `topology.tsx`: lazy React Flow canvas sharing the common controls.

A profile/region or route change unmounts the prior workspace. Async results from unmounted pages are ignored. API input changes invalidate reviews, pending execution prevents duplicate submissions, and real writes still require the existing backend session flag and account-bound confirmation.

Keep the header-free layout. Connection controls remain at the sidebar footer; language and density are in Settings. Resources use a common table, quick inspection uses Sheet, and full details use Tabs. Neutral surfaces and a restrained accent identify navigation and focus without decorative gradients.

Validation: frontend regression tests cover stale account data, inert resource text, API confirmation invalidation, duplicate submission, unsupported requested operations, scoped action inputs, S3 paging, frozen log filter/time ranges, and context-menu keyboard/native editing behavior. Browser checks cover the visible layout and interactions; AWS mutation APIs are not exercised.

## Themes and layout

Settings → Appearance → Theme provides Light, Dark and System. System is the default; changes in the operating-system preference apply while the app is open. The selection persists immediately and is independent of the language/region Save button.

The same semantic tokens cover controls, tables, sheets, menus and the infrastructure canvas. Diagram nodes, groups, edges, labels, controls and minimap follow the active theme. PNG and PDF exports capture that theme, including the PDF header. Theme changes do not rerun AWS queries or reset diagram positions.

The diagram toolbar uses a 36px control height and a common grid row. Search moves to a separate row at narrower widths. Settings selects occupy equal-width columns; sidebar profile and region controls share the same width.
