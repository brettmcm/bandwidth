# Design QA

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-816dd04a-5a42-4f8f-80ec-5ec2a8658e76.png`
- Implementation screenshot: `/Users/bmcmillin/Apps/Bandwidth/implementation-drawer.png`
- Focused comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-comparison.png`
- State: Asana-backed task detail drawer, read-only view
- Viewport: 1280 × 720 CSS px
- Source dimensions: 980 × 384 px; no CSS size or density metadata supplied
- Implementation dimensions: 1280 × 720 px, captured at a 1280 × 720 CSS viewport; browser device pixel ratio 2, screenshot normalized to CSS pixels

## Full-view comparison evidence

The full drawer capture verifies the simplified section headings, reduced link logos, and punctuation-free link labels in context. No clipping, overflow, or hierarchy regressions are visible.

## Focused comparison evidence

The side-by-side runway-plan comparison confirms the requested correction: Supporting areas begins at the same horizontal coordinate as Confidence. Measured in the rendered drawer, Confidence and Supporting areas both begin at x=996 CSS px; Landing and Primary area both begin at x=846 CSS px.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: existing hierarchy and optical weights remain consistent; source-link labels are clean and punctuation-free.
- Spacing and layout rhythm: the two runway rows now share the same three-column grid; the second row occupies columns one and two.
- Colors and visual tokens: existing section and brand colors remain unchanged and legible.
- Image quality and asset fidelity: official vector brand marks remain sharp at the revised 14 px size.
- Copy and content: “Local” and “Read only” labels are removed from section headings.

## Interaction checks

- Source links still expose the correct destinations.
- Explicit Edit remains available.
- Browser console: no errors or warnings.

## Comparison history

- Earlier issue: Supporting areas sat between the Confidence and Prep grid positions.
- Fix: all runway-plan cells now span two tracks in the six-track grid, placing Supporting areas directly below Confidence.
- Post-fix evidence: measured x coordinates match and the focused comparison confirms the alignment visually.

## Follow-up polish

- None required for this scope.

## Timeline follow-up QA — calendar sections and tentative strokes

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-e6f2c810-da4e-4927-8f54-0f2cc66fb75c.png`
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-timeline-viewport.png`
- Focused implementation crop: `/Users/bmcmillin/Apps/Bandwidth/implementation-timeline-lines-detail.png`
- Combined comparison evidence: `/Users/bmcmillin/Apps/Bandwidth/design-qa-timeline-lines-comparison.png`
- Viewport: 1280 × 720 CSS px, light mode
- Source pixels: 990 × 548
- Implementation pixels: 1280 × 720 at device scale factor 1
- Density normalization: source retained at 990 × 548; implementation cropped to 990 × 548; both stacked without further scaling
- State: initial timeline position with weekend bands, a bordered blackout, confirmed commitments, and tentative commitments visible

No actionable P0, P1, or P2 differences remain. The separate Monday guides have been removed, leaving the light-gray Saturday-through-Sunday columns to define the weekly rhythm. Blackout sections retain the same fill and now have subtle one-pixel left and right borders. Tentative bars use a one-pixel mask with one-pixel round dots separated by three pixels; measured line and start-dot centers match exactly. Confirmed bars remain two pixels solid. Typography, spacing, existing colors, asset fidelity, and app-specific copy remain unchanged. The browser console contains no errors or warnings; lint, build, and all three rendered-output tests pass.

final result: passed

## Completed task row QA

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-8620aef9-ba87-45ba-b257-7b7800605703.png`
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-completed-task-full.png`
- Focused implementation crop: `/Users/bmcmillin/Apps/Bandwidth/implementation-completed-task-focus.png`
- Viewport: 1280 × 720 CSS px, browser device pixel ratio 2
- Source pixels: 1056 × 288; no CSS size or density metadata supplied
- Implementation pixels: 1280 × 720 for the full capture and 520 × 180 for the focused crop; browser output normalized to CSS-pixel dimensions
- State: Days tab, August 12, 2026 drawer, one completed Asana task
- Theme note: the source capture is dark while the in-app Browser capture is light. Structure and spacing were compared directly; marker colors were verified through the shared `--interaction` and `--canvas` theme tokens.

### Full-view comparison evidence

The browser-rendered full view confirms that the completed row remains inside the established drawer layout, with no clipping, overflow, or displacement of the Reflection section. The Completed section contains the source logo in its header and only the marker and linked title in the task row.

### Focused comparison evidence

The source image and focused implementation crop were opened together in one comparison input. The implementation removes the metadata line, vertically centers the 18 px marker against the remaining title line, fills the circle with the foreground token, reverses the check to the canvas token, shifts the title upward by 2 px, and places a 10 px monochrome Asana logo at the top-right of the Completed header. Measured in the rendered view, the final title center is 0.5 CSS px above the marker center and the logo center aligns exactly with the heading center.

### Findings

- No actionable P0, P1, or P2 differences remain for the requested scope.
- Fonts and typography: the existing 12 px title styling, weight, line height, and family remain unchanged; the title has the requested 2 px visual offset.
- Spacing and layout rhythm: the row uses centered cross-axis alignment and retains its existing 12 px marker-to-title gap. Removing the metadata collapses the row cleanly to a single line.
- Colors and visual tokens: the marker uses `var(--interaction)` for its fill and border and `var(--canvas)` for the check, providing the requested foreground/background reversal in both themes.
- Image quality and asset fidelity: the existing official Asana SVG is reused as a 10 px foreground-color mask and remains sharp at the reviewed density; the completion mark also remains crisp.
- Copy and content: the primary-area and request-type metadata are absent; only “Brett's test task” remains.

### Interaction checks

- The completed task title remains a valid Asana link.
- The Days tab and both empty and completed-day drawers open successfully; the Completed section remains visible in the empty state.
- Browser console: no errors.
- Lint, production build, and all 30 rendered-output tests pass.

### Comparison history

- Initial source issue: the outlined marker aligned to the top of a two-line title/metadata block.
- Fixes: centered the row, changed the marker to the inverse solid treatment, removed the metadata line, moved the title upward first by 1 px and then by one additional pixel, and added a small monochrome Asana source logo to the header's top-right edge.
- Post-fix evidence: the final focused capture and browser measurements show the single-line composition, inverse marker, requested 2 px title offset, and a 10 × 10 px foreground-color logo centered with the heading and set flush to the heading row's right edge.

### Follow-up polish

- None required for this scope.

final result: passed

## Area board QA — tonal columns and borderless cards

- Source visual truth: `/Users/bmcmillin/.codex/generated_images/019ff953-e496-7f53-9feb-bd9f8953305f/exec-81bb7b8d-3cb7-4c36-a26b-7b4540f2c2a8.png`
- Normalized source: `/Users/bmcmillin/Apps/Bandwidth/design-qa-area-board-source.png`
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-area-board.png`
- Full-view comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-area-board-comparison.png`
- Focused card comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-area-board-detail.png`
- Viewport: 1280 × 720 CSS px, device scale factor 1
- Source pixels: 1672 × 941, normalized to 1280 × 720 for the comparison
- Implementation pixels: 1280 × 720 at a 1280 × 720 CSS viewport; no density normalization required
- State: Area tab active, detail drawer closed, pointer outside the board
- Theme note: the selected concept is dark while the in-app Browser inherited the product's light system theme. Layout, typography, surface hierarchy, and interaction were compared directly; palette was evaluated as the intentional light-theme mapping of the same existing tokens rather than as a literal color match.

### Full-view comparison evidence

The combined comparison shows the same four-column composition, compact selected Area tab, quiet full-height column surfaces, borderless tonal cards, and title/category-only content. The implementation uses the live primary-area values and ordering, so “Design Philosophy” replaces the concept's placeholder “Needs tagging.” No owner, requester, schedule, item count, divider, or per-card completion control appears in the board.

### Focused comparison evidence

The focused comparison confirms the two-level surface hierarchy and compact card rhythm. At 1280 px, the first column is 292 px wide and 500 px high; its cards are 256 px wide by 86 px high. Computed card borders are `0px none`. Title text renders at 13 px/16.9 px with the existing Inter-based UI stack and weight 550, while category text remains visually subordinate.

### Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the app's existing brand and UI families are retained; column headings, titles, and categories reproduce the target hierarchy without truncation at the reviewed viewport.
- Spacing and layout rhythm: columns use equal tracks, 10 px gutters, 18–20 px internal padding, 10 px card gaps, and extend to the bottom content margin after removal of the redundant Area footer.
- Colors and visual tokens: the column uses the product's subtle surface token and the card uses the raised surface token. The light-theme capture preserves the target's one-step tonal separation; dark mode maps the same tokens to the approved dark treatment.
- Image quality and asset fidelity: this view contains no raster imagery, decorative art, avatars, or custom icons. Existing top-right vector actions remain unchanged.
- Copy and content: cards show only the live display title and `requestType`-derived support category. Live primary-area values determine column headings.

### Interaction and responsive checks

- Timeline and Area tabs switch in both directions; Timeline remains visible and unchanged after returning to it.
- Clicking an Area card opens the existing detail drawer for that exact item.
- Hover leaves the card background and transform unchanged; only the title transitions to the accent color. Computed background stayed `rgb(255, 255, 255)` and transform stayed `none` before and after hover.
- At 760 × 720, the page itself remains 760 px wide while the 1,150 px board scrolls inside its region, preserving column structure without document-level overflow.
- Browser console: no errors.
- Lint, production build, and all 23 rendered-output tests pass.

### Comparison history

- Earlier interaction finding: the Area card hover changed the entire fill and translated the card upward. Fix: removed card-surface and transform hover styles, retaining only the title-color transition. Post-fix evidence: computed background and transform remain unchanged through hover.
- First full-view finding: the existing Area footer added copy absent from the selected concept and shortened the column surfaces by roughly one footer row. Fix: removed the Area-only footer while preserving Timeline's status and zoom controls. Post-fix evidence: the final implementation capture shows columns extending to the intended bottom margin.

### Follow-up polish

- None required for this scope.

final result: passed

## Area-grouped view QA

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-899badeb-0e7f-454f-b06f-f1a621e886ba.png` for the compact selected-tab treatment and `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-238070e8-2b9f-45d0-b877-4c5a4e280866.png` for collapsible grouped rows
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-area-view-source.png`
- Combined comparison evidence: `/Users/bmcmillin/Apps/Bandwidth/design-qa-area-comparison.png`
- Viewport: 1280 × 720 CSS px, dark mode, browser device pixel ratio 2
- Source pixels: 2356 × 564 and 2286 × 580; normalized proportionally to 1280 × 306 and 1280 × 324
- Implementation pixels: 1280 × 720, normalized by the browser to CSS-pixel dimensions
- Comparison pixels: 1280 × 1406; both references and the implementation are stacked at a common 1280 px width with 28 px separators
- State: Area tab active, all product-area groups expanded, detail drawer closed

### Full-view comparison evidence

The combined comparison confirms that the implementation carries over the references' compact rounded tabs, quiet secondary metadata, collapsible group headings with counts, and full-width segmented rows. The composition is adapted to Bandwidth's existing dark tokens rather than copying the references' light palette. The completion circles from the grouped-list reference are intentionally omitted because Area is a browse-and-compare view; the entire row is the detail affordance.

### Focused comparison evidence

A separate crop was not needed. At the normalized 1280 px width, tab state, group count typography, row dividers, request-type/supporting-area text, requester, and schedule window are all legible in the full comparison. There are no source images, logos, or dense micro-controls that require a closer crop.

### Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the existing Bandwidth UI, brand, and monospace families are retained. Group headings use the product's compact title weight; counts and dates use the existing mono treatment; row hierarchy remains readable without overpowering Timeline.
- Spacing and layout rhythm: compact tabs sit in the existing header-to-content gap. Groups use a consistent 28 px rhythm; 68 px segmented rows align title, requester, and date without crowding. The 720 px desktop viewport scrolls vertically without hiding the persistent footer.
- Colors and visual tokens: the selected tab uses an 8% interaction tint over the canvas for a visible but quiet selected state in both themes. Dividers, hover fill, text hierarchy, and focus indicators use existing Bandwidth tokens.
- Image quality and asset fidelity: neither reference requires raster imagery or custom icon assets. The native disclosure marker remains sharp at every density; no placeholder or generated asset is present.
- Copy and content: groups are derived from each item's primary area. Rows expose the real request type, supporting areas, requester, and prep-to-landing date window so likely demo-asset and script overlap can be compared in context.

### Interaction checks

- Timeline and Area switch by click and Left/Right Arrow keys with tab/tabpanel semantics.
- Product-area groups collapse and reopen.
- Clicking an Area row opens the existing detail drawer for that item.
- The Area list contains no completion control; completion remains confined to the shared detail drawer.
- Browser console: no errors or warnings.
- Lint, production build, and all 21 rendered-output tests pass.

### Comparison history

- First visual pass: the selected tab's existing surface token was too quiet against the dark canvas, while the inherited two-pixel focus ring carried too much visual weight.
- Fix: raised the selected fill to an 8% interaction tint and reduced the tab-specific focus outline to one pixel while preserving keyboard visibility.
- Post-fix evidence: `/Users/bmcmillin/Apps/Bandwidth/implementation-area-view-source.png` and the bottom panel of `/Users/bmcmillin/Apps/Bandwidth/design-qa-area-comparison.png` show a clear selected state that remains proportionate to the reference.

### Follow-up polish

- None required for this scope.

final result: passed

## Confidence removal and decision-derived timeline QA

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-d5775125-00b4-412d-8203-222cd82f092e.png`
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-confidence-removal.png`
- Combined focused comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-confidence-removal-comparison.png`
- Viewport: 1280 × 720 CSS px, light mode, browser device pixel ratio 2
- Source pixels: 938 × 1091 with no density metadata; normalized to 599 × 696 for the comparison
- Implementation pixels: 1280 × 720 normalized to CSS pixels; drawer region is 480 × 696
- State: Release Notes Ep8, an Asana-backed commitment, in edit mode

### Full-view and focused comparison evidence

The browser-rendered full view confirms that the drawer remains fully visible, the action footer stays reachable, and the timeline remains legible behind the overlay. The combined comparison places the annotated source and rendered drawer together: Working landing start, Working landing end, Calculated schedule, and Confidence are absent, while the requested remaining fields retain the established control styling and reflow without gaps.

### Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the existing family, weights, sizes, line heights, and label hierarchy are unchanged across the retained form.
- Spacing and layout rhythm: the removed rows collapse cleanly; Prep days and Primary area share the first compact row, Supporting areas follows naturally, and the footer remains pinned without overlap.
- Colors and visual tokens: input borders, surfaces, text colors, overlay, and focus-ready controls continue to use the existing tokens with sufficient contrast.
- Image quality and asset fidelity: the Asana and Slack vector marks remain sharp and correctly scaled; no image assets were substituted or degraded.
- Copy and content: the four annotated field labels and their values are removed from Asana edit mode. Manual commitments intentionally retain Landing start and Landing end so they can still be placed on the runway.

### Interaction checks

- Existing Asana commitments open in detail mode and enter the simplified editor successfully.
- New manual commitments still expose usable landing-date controls.
- Only the `decision_needed` Amazon commitment receives `timeline-card--decision-needed` and the dotted radial stroke; all four other commitments render solid strokes.
- Browser console: no errors or warnings.
- Lint, production build, and all 14 rendered-output tests pass.

### Comparison history

The first rendered comparison found no actionable P0/P1/P2 mismatch, so no post-comparison visual fix cycle was required.

### Follow-up polish

- None required for this scope.

final result: passed

## Drawer field-height QA

- Source visual truth: `/var/folders/nb/2pcql9n15m1dbx7_tbwnfjrr0000gn/T/codex-clipboard-e3cbcc2f-c677-4403-b1ff-7d708916d004.png`
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/implementation-drawer.png`
- Focused comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-comparison.png`
- Viewport: 1280 × 720 CSS px, light mode
- Source dimensions: 1024 × 552 px; no density metadata supplied
- Implementation dimensions: 1280 × 720 px at browser device pixel ratio 2, normalized to CSS pixels
- State: Asana-backed task detail drawer in edit mode

No actionable P0, P1, or P2 differences remain. Every single-line form control—text, URL, number, and select—measures exactly 38 CSS px high. The textarea retains its intended multiline behavior. Typography, spacing, colors, border treatment, imagery, and copy are otherwise unchanged. Edit mode opens successfully, the controls remain usable, and the browser console contains no errors or warnings. Lint, build, and all three rendered-output tests pass.

Comparison history: native select controls previously rendered shorter because the shared rule set only supplied a minimum height. The single-line controls now receive an explicit 38 px height, producing a consistent row rhythm across the form.

final result: passed

## Blackout four-sided border QA

- Source visual truth: `/Users/bmcmillin/Apps/Bandwidth/qa-blackout-before-top.png` and `/Users/bmcmillin/Apps/Bandwidth/qa-blackout-before-bottom.png`, representing the matched live timeline state before the requested top and bottom borders
- Browser-rendered implementation: `/Users/bmcmillin/Apps/Bandwidth/qa-blackout-after-top.png` and `/Users/bmcmillin/Apps/Bandwidth/qa-blackout-after-bottom.png`
- Full-view comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-blackout-borders-comparison.png`
- Focused comparison: `/Users/bmcmillin/Apps/Bandwidth/design-qa-blackout-borders-detail-v2.png`
- Viewport: 1280 × 720 CSS px, light mode, device scale factor 1
- Source and implementation pixels: 1280 × 720 for each matched capture; no density normalization required
- State: identical live timeline data captured at the top and bottom scroll positions before and after the requested border change

No actionable P0, P1, or P2 differences remain. The blackout now uses the same one-pixel `var(--line)` border on all four sides. The focused comparison confirms the new top and bottom edges while the fill, corner radius, label, width, and existing left/right edges remain unchanged. Fonts and typography, spacing and layout rhythm, colors and visual tokens, image quality and asset fidelity, and app-specific copy are unchanged. Lint, build, and all three rendered-output tests pass.

final result: passed
