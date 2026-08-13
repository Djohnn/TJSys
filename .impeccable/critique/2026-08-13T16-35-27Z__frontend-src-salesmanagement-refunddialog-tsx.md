---
target: R9 sales compensation dialogs
total_score: 36
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-13T16-35-27Z
slug: frontend-src-salesmanagement-refunddialog-tsx
---
Method: degraded single-context (spawn_agent unavailable in this session)

Target: R9 sales compensation dialogs: RefundDialog, ReturnDialog, and CancellationDialog.

Design-specificity verdict: Pass. The dialogs use the incumbent TJSys sales-management language, Button variants, surface/border/neutral tokens, and the existing tenant-aware API client. They are not a new visual world.

Nielsen heuristic scores:

| Heuristic | Score | Evidence |
| --- | ---: | --- |
| Visibility of system status | 4/4 | Explicit loading status, empty status, live mutation errors, and disabled pending actions. |
| Match between system and real world | 4/4 | Portuguese sales terms and real serializer values for total, items, and payment method. |
| User control and freedom | 3/4 | Close/cancel controls exist; no Escape/backdrop close or focus return. |
| Consistency and standards | 4/4 | Shared API client, Button component, tenant conventions, and dialog semantics. |
| Error prevention | 4/4 | Required reason, amount bounds, empty-payment/item guards, and idempotency keys. |
| Recognition rather than recall | 4/4 | Labels, summaries, item fallbacks, and actionable error copy are visible in context. |
| Flexibility and efficiency | 3/4 | Partial refund and item-level return are supported; keyboard focus flow is not enhanced. |
| Aesthetic and minimalist design | 4/4 | No decorative additions; concise summaries and single-purpose actions. |
| Help users recognize and recover from errors | 4/4 | 404 and API failures are accessible alerts with a safe close path. |
| Help and documentation | 2/4 | Inline guidance exists for amount, but no additional contextual help for rare compensation rules. |

Design health score: 36/40.

Priority issues:
- [P2] Modal focus management is still incumbent-level: no initial focus, focus trap, Escape handling, or focus restoration after close. This is outside the contract remediation and should be a shared Modal enhancement rather than a local workaround.
- [P2] The close icon relies on the compact incumbent hit area. Visible focus styling is now explicit; a shared modal control can standardize a 44px target later.

Persona red flags: a cashier on a narrow viewport can now scroll all three content panels; a cashier with a failed or missing sale receives a clear, non-enumerating recovery state. A keyboard-only cashier can reach labeled controls, but focus restoration remains a shared-shell concern.

Positive findings: real serializer normalization is centralized; loading, empty, error, and pending states are distinct; mutation feedback is announced; no detector anti-patterns were reported for any target.

Questions skipped: findings are bounded, the requested remediation scope is explicit, and the remaining P2s require a shared modal decision outside this patch.
