---
target: R9 sales compensation dialogs
total_score: 39
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-13T19-03-48Z
slug: r9-sales-compensation-dialogs
---
Target: R9 sales compensation dialogs: shared Modal, RefundDialog, ReturnDialog, and CancellationDialog.

Design-specificity verdict: Pass. The change preserves the incumbent TJSys sales-management language, Button variants, surface/border/neutral tokens, and tenant-aware API client. It adds one shared interaction primitive instead of creating a new visual world.

Nielsen heuristic scores:

| Heuristic | Score | Evidence |
| --- | ---: | --- |
| Visibility of system status | 4/4 | Loading, empty, error, and pending mutation states are explicit and announced. |
| Match between system and real world | 4/4 | Portuguese sales terms, serializer totals, line totals, payment methods, and useful fallbacks are shown in context. |
| User control and freedom | 4/4 | Header close, cancel/close actions, Escape, backdrop close when safe, focus trap, and focus restoration are covered. |
| Consistency and standards | 4/4 | All three dialogs share Modal, Button, API client, tenant, and dialog semantics. |
| Error prevention | 4/4 | Required reason, Decimal amount bounds, empty guards, quantity step, and idempotency keys are present. |
| Recognition rather than recall | 4/4 | Labels, summaries, refundable balance, item fallbacks, multiple-payment guidance, and recovery copy are visible. |
| Flexibility and efficiency | 4/4 | Partial refund, item-level return, keyboard operation, and adjustable multiple-payment method are supported. |
| Aesthetic and minimalist design | 4/4 | No decorative redesign; summaries and actions remain single-purpose. |
| Help users recognize and recover from errors | 4/4 | 404 and server errors are accessible alerts with a safe close path and no form crash. |
| Help and documentation | 3/4 | Inline amount/multiple-payment guidance is present; rare compensation rules remain intentionally out of scope. |

Design health score: 39/40.

Priority issues: none at P0/P1. The remaining P2 is the incumbent compact close-icon visual target; it is keyboard-visible and tested, but a broader shell-wide touch-target pass should be separate from this scoped remediation.

Evidence: mechanical detector returned []; focused dialog tests cover keyboard focus, Escape, restoration, loading close, empty/error states, Decimal refund balance, and discounted partial return; Playwright dialog axe scans cover the real R9 journeys.

Questions skipped: findings are bounded, the requested scope is explicit, and the only remaining P2 is outside the three-dialog remediation boundary.
