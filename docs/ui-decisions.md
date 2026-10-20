# UI decisions

The interface is a resource browser, not a marketing page. Its primary tasks
are locating a resource, comparing rows and inspecting one item.

- Replaced the slogan, eyebrow, decorative workspace card and three summary
  cards with a compact connection toolbar and one resource table.
- Kept account/profile/region visible. Account identity is independent of the
  profile name; two profiles can represent the same account.
- Used consistent outline icons, restrained blue selection, neutral borders,
  normal sentence-case labels and legible table text.
- Made the sidebar a real collapsible navigation control with accessible names,
  tooltips, `aria-expanded`, a keyboard shortcut and persisted state.
- Centralized English/Korean messages. Dates follow the chosen locale.
- Kept search beside the data and made loaded-row counts explicit.
- Put S3 folder navigation and log filters inside contextual detail panels.

Sources consulted:

- [NN/g: Data Tables — Four Major User Tasks](https://www.nngroup.com/articles/data-tables/)
  informed the focus on finding, comparing and inspecting records.
- [GOV.UK: Images](https://design-system.service.gov.uk/styles/images/)
  supports avoiding unnecessary visual decoration.
- [GOV.UK: Styles](https://design-system.service.gov.uk/styles/)
  supports consistent visual meanings and established controls.

These are applied design judgments, not an objective test for whether a UI
looks AI-generated.
