# E-13 — Embed Modes

> **Priority:** Post-MVP · **Sprints:** 13–14 · **Story Points:** 13 · **Release:** R4

Lightweight embed options for integrating the booking flow into non-Next.js websites via script tags.

---

## User Stories

### 13.1 E13-S01 — Inline Embed `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** embed the booking calendar inline on any website using a script tag **so that** I can add booking to sites built with any framework or CMS.

**Acceptance Criteria:**

- [ ] `@slotkit/embed` package exports a single JS file (< 50 KB gzipped) that renders the booking flow in a specified container.
- [ ] Usage: `<script src="slotkit-embed.js" data-provider="xyz" data-event-type="haircut" data-container="#booking"></script>`.
- [ ] The embed renders the full flow: calendar → slots → questions → confirmation.
- [ ] Custom colors and branding are configurable via data attributes or a config object.

---

### 13.2 E13-S02 — Popup & Floating Button Modes `[Should]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** use a popup or floating button embed mode **so that** I can offer booking without dedicating page real estate.

**Acceptance Criteria:**

- [ ] Popup mode: a button click opens the booking flow in a centered modal overlay.
- [ ] Floating button mode: a persistent button in the page corner opens the popup on click.
- [ ] Both modes use the same embed script with a `data-mode="popup"` or `data-mode="float"` attribute.
- [ ] The modal is closable via X button, Escape key, or clicking outside.

---

### 13.3 E13-S03 — Embed Code Generator `[Could]` · 3 pts

- [ ] **Complete**

**As an** admin, **I want to** generate embed code snippets from the admin dashboard **so that** I can give my clients ready-to-paste code without technical knowledge.

**Acceptance Criteria:**

- [ ] `<EmbedConfigurator />` component lets the admin select: embed mode, event type, and brand colors.
- [ ] Generates a copy-paste HTML snippet with the correct configuration.
- [ ] A live preview shows what the embed will look like.
- [ ] Snippets are generated for all three modes (inline, popup, float).
