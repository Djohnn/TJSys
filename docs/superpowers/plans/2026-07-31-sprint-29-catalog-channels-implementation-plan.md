# Sprint 29 Catalog Channels Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare versioned product content for digital channels without coupling Catalog to a marketplace provider.

**Architecture:** Store channel-neutral publication profiles and ordered images in Catalog. Publish a versioned Outbox event through a stable port; adapters remain optional and no external provider is implemented in this sprint.

**Tech Stack:** Django/DRF, Outbox, React/TypeScript, pytest, Vitest and Playwright.

---

### Task 1: Channel profile domain

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/urls.py`
- Create: `backend/catalog/services/channels.py`
- Create: `backend/catalog/migrations/0011_channel_profiles.py`
- Create: `backend/tests/test_catalog_channels.py`

- [ ] Write RED tests for channel slug, title/description, dimensions/weight, ordered images, same-tenant product and versioning.

```python
def test_ready_profile_requires_primary_image(profile):
    profile.status = 'ready'
    with pytest.raises(ValidationError):
        profile.full_clean()
```

- [ ] Run focused pytest; expected: FAIL.
- [ ] Implement `ProductChannelProfile` with statuses `draft`, `ready`, `published`, `failed` and immutable version snapshots.
- [ ] Generate migration and run RLS/IDOR tests; expected: PASS.
- [ ] Commit: `feat(catalog): add versioned channel profiles`.

### Task 2: Provider-neutral publication port and Outbox

**Files:**
- Create: `backend/catalog/ports.py`
- Modify: `backend/catalog/services/events.py`
- Create: `backend/tests/test_channel_publication.py`

- [ ] Write RED test: publishing twice with the same idempotency key creates one `catalog.channel.publication_requested` event.
- [ ] Run focused pytest; expected: FAIL.
- [ ] Implement `request_channel_publication(profile_id, idempotency_key)` in one transaction with Outbox and sanitized payload.
- [ ] Run Outbox/idempotency regression; expected: PASS.
- [ ] Commit: `feat(catalog): expose channel publication port`.

### Task 3: Channels step and preview

**Files:**
- Modify: `frontend/src/catalog/ProductChannelsStep.tsx`
- Create: `frontend/src/catalog/ChannelPreview.tsx`
- Modify: `frontend/src/catalog/catalogApi.ts`
- Test: `frontend/src/catalog/channels.test.tsx`

- [ ] Write RED tests for draft editing, image ordering, required-field summary and preview.
- [ ] Run Vitest target; expected: FAIL.
- [ ] Implement profile editor using Sprint 24 media and current Zyrp components; label publication as internal request, not external success.
- [ ] Run tests, axe, typecheck and build; expected: PASS.
- [ ] Commit: `feat(frontend): add product channel profiles`.

### Task 4: E2E and closure

**Files:**
- Create: `frontend/e2e/catalog-channels.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-029_Catalog_Channels_Final_Report.md`

- [ ] E2E prepare profile → preview → request publication → verify one auditable event and no external call.
- [ ] Run Playwright, Catalog/Outbox regression and frontend gates; expected: 0 failures.
- [ ] Record raw output and commit with `feat: sprint 29 - canais do catalogo`.
