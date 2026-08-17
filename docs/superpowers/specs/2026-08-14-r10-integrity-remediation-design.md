# R10 Integrity Remediation Design

## Objective

Close the five integrity gaps found in the Sprint 10 audit without expanding the
original purchasing, receiving, inventory, and payables scope.

## Decisions

### Receiving atomicity

`receive_purchase_order()` reloads the purchase order with `select_for_update()`
before reading pending quantities. Input rows are normalized by
`purchase_order_item_id`, quantities are summed, and conflicting unit costs for
the same item are rejected. The aggregated quantity is compared once with the
locked pending balance.

### Idempotency

The canonical payload is built before replay lookup. A matching tenant/key and
matching hash returns the existing receipt; a different hash raises
`DuplicateIdempotencyKey`. Conditional unique constraints on `(tenant,
idempotency_key)` make purchase-order approval and receipt creation safe under
concurrency while still allowing blank keys on draft records.

### Approved-order immutability

The API rejects update, partial update, and delete for purchase orders outside
`draft`. Purchase-order items can only be created, changed, or deleted while
their parent order is `draft`. The guard is explicit in the ViewSets so deletion
cannot bypass model validation.

### Request validation

The receive action rejects an empty `items` list and malformed/non-positive
quantities or costs with a Problem Details response. Domain services repeat the
non-empty and positivity checks so non-HTTP callers cannot bypass them.

### Payable provenance

`Payable` gains nullable protected foreign keys to the originating `Supplier`,
`PurchaseOrder`, and `PurchaseReceipt`. `financial.services.create_payable()`
accepts these optional references and validates tenant consistency. Purchasing
passes all three references when confirming a receipt. Other payable sources
remain compatible because the fields are nullable.

## Error contract

Business conflicts return RFC 9457-shaped responses. Idempotency conflict and
over-receipt use HTTP 409; malformed or empty receipt input and immutable-order
mutations use HTTP 400. No raw `IntegrityError` is exposed.

## Verification

BDD-style pytest scenarios cover duplicate rows, divergent replay, empty input,
approved update/delete, provenance, and concurrent receiving. The focused R10
suite, Ruff, mypy, Django checks, and migration checks must pass before closure.
