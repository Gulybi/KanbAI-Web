# Feature: Clean Up Landing Page Content (Remove AI Hallucinations)

**GitHub Issue:** [#58](https://github.com/Gulybi/KanbAI-Web/issues/58)
**Milestone:** None (tracked as a `bug` label)
**Branch:** `58-clean-up-landing-page-content-remove-ai-hallucinations`

## Business Value

### Who is this for?
- **Unauthenticated visitors** arriving on the KanbAI landing page (`/`) who read the headline, subheadline, and feature cards before deciding whether to register or log in.
- **Stakeholders and early evaluators** (product owner, prospective beta testers, reviewers of screenshots or demos) who form first impressions of the product's credibility.
- **The engineering/product team**, whose roadmap is currently misrepresented by copy that describes capabilities the backend and frontend do not yet support.

### Why is it valuable?
The landing page is the only public-facing surface of the product. Its copy was generated during the scaffolding of issue [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) and contains marketing claims that were never grounded in the actual implementation. These claims are commonly called "AI hallucinations" — plausible-sounding statements unsupported by the product's real capabilities.

Fixing this is valuable because:
- **Trust & integrity:** Visitors who sign up expecting AI-driven insights, real-time collaboration, team chat, and workflow automation will feel misled when the authenticated experience delivers none of those. Credible copy protects the project's professional reputation.
- **Accurate expectations:** The landing page currently sets expectations that the roadmap (issues #45–#52, SignalR and file upload work) has not yet met. Honest copy aligns visitor expectations with what is genuinely available today (project dashboard, project creation, members management, auth).
- **Reduced rework downstream:** Marketing/feature copy that hallucinates functionality forces the team to either rush the missing features or apologise to users. Cleaning up the copy now prevents both.
- **Clean foundation for future marketing:** Once real features (SignalR real-time, file attachments, AI assistance) actually ship, the team can incrementally add accurate, substantiated claims rather than pruning false ones.

### What problem does it solve?
**Problem:** The live landing page advertises features that do not exist in the codebase. Specifically, the hero subheading promises "intelligent automation, real-time collaboration, and data-driven insights," and the "Why Choose KanbAI?" section lists four feature cards (Real-time Kanban Boards, AI-Driven Insights, Team Collaboration, Smart Automation) whose descriptions reference machine learning, sprint velocity prediction, bottleneck detection, in-app chat, @mentions, notifications, and adaptive automation rules — none of which are implemented. The "trust indicators" strip ("No credit card required • Secure by default • Set up in minutes") further implies a pricing/onboarding story that does not yet exist.

**Solution:** Replace the landing page textual content so every claim is either:
1. Supported by what the product actually delivers today (project dashboard, project creation, member management, authenticated Kanban workspace shell), or
2. Phrased as a clearly forward-looking / roadmap statement (e.g., "coming soon", "on the roadmap") rather than a present-tense capability, or
3. Removed entirely if it cannot be honestly stated.

The page must still fulfil the original intent from issue #29 (brand identity, value proposition, clear CTAs to login/register, responsive layout), but its wording must be truthful.

---

## Current State vs Desired State

### Current State

The landing page is composed of a root component and three presentational children:

- **Page shell:** `KanbAI-Web/src/app/features/landing/landing-page/landing-page.component.html` / `.ts` — owns the `features` signal with four hardcoded `FeatureHighlight` entries.
- **Hero section:** `KanbAI-Web/src/app/features/landing/components/hero-section/hero-section.component.html`
- **Features section:** `KanbAI-Web/src/app/features/landing/components/features-section/features-section.component.html`
- **Feature card:** `KanbAI-Web/src/app/features/landing/components/feature-card/feature-card.component.html` / `.ts`
- **Model:** `KanbAI-Web/src/app/features/landing/models/feature-highlight.interface.ts`

**Specific hallucinated or unsupported claims present today:**

1. **Hero subheading** (`hero-section.component.html`, line 15–18):
   > "Streamline your workflow with intelligent automation, real-time collaboration, and data-driven insights that adapt to your team's needs."
   — The app has no automation engine, no real-time layer (SignalR is tracked as open issue [#45](https://github.com/Gulybi/KanbAI-Web/issues/45)), and no analytics/insights feature.

2. **Trust-indicator line** (`hero-section.component.html`, line 40–42):
   > "No credit card required • Secure by default • Set up in minutes"
   — There is no payment flow, no published security posture, and no onboarding wizard; these phrases mimic SaaS marketing boilerplate.

3. **Features section header** (`features-section.component.html`, lines 5–10):
   > "Why Choose KanbAI?" / "Powerful features that transform how your team collaborates and delivers results."
   — Overclaims "powerful features" relative to current functionality (auth + project dashboard skeleton; the board route is a placeholder — see `board-page.component.html`).

4. **Feature card #1 — "Real-time Kanban Boards"** (`landing-page.component.ts`, lines 20–25):
   > "Collaborate seamlessly with your team on dynamic boards that update instantly across all devices."
   — No real-time sync exists; board page currently renders only a placeholder `<h1>Board Page</h1>`.

5. **Feature card #2 — "AI-Driven Insights"** (`landing-page.component.ts`, lines 26–31):
   > "Leverage machine learning to identify bottlenecks, predict sprint velocity, and optimize workflows."
   — No ML, no velocity prediction, no bottleneck analytics, no optimisation engine.

6. **Feature card #3 — "Team Collaboration"** (`landing-page.component.ts`, lines 32–37):
   > "Built-in chat, mentions, and notifications keep your team aligned and productive."
   — No chat, no @mentions, no notifications are implemented.

7. **Feature card #4 — "Smart Automation"** (`landing-page.component.ts`, lines 38–43):
   > "Automate repetitive tasks with intelligent rules that adapt to your workflow patterns."
   — No automation rules engine exists.

**What the product actually delivers today (verified in codebase):**
- Public landing page at `/` (this page), login at `/login`, registration at `/register`.
- Authenticated project dashboard at `/dashboard` (`dashboard-page.component.html`) with loading / success / empty / error states, project creation modal, and project members management (shipped via #30, #31, #32, #33).
- Authenticated board route `/board` exists but is a placeholder.
- Route guards (`authGuard`, `unauthGuard`) correctly gate access.

### Desired State

- **Expected behavior:** The landing page continues to render the same structural layout (hero, features section, CTAs) and keeps the existing routing/guard behaviour. Only the textual content (headlines, subheadings, feature titles, feature descriptions, trust-indicator line, "Why Choose" copy) is revised so that every assertion is either accurate today or explicitly labelled as upcoming/roadmap.
- **Expected user flow (unchanged):**
  1. Unauthenticated visitor lands on `/`.
  2. Sees KanbAI brand, a headline, and a subheading that honestly describes the product as a Kanban-style project management app (with AI assistance framed as a future/ongoing direction, not an existing delivered capability).
  3. Sees a revised feature section whose cards describe either (a) capabilities that actually exist, or (b) capabilities that are clearly marked "coming soon" / "on the roadmap".
  4. Clicks "Get Started Free" → `/register`, or "Login" → `/login`.
  5. Authenticated users visiting `/` are redirected by `unauthGuard` (behaviour unchanged).
- **Tone & voice:** Plain, confident, non-boastful. Avoids vendor-neutral SaaS clichés ("transform", "leverage", "powerful"). Avoids unverifiable superlatives.
- **Structural changes:** None required. The component tree, `FeatureHighlight` interface, icon mapping, routing, guards, and CSS classes stay as they are. Only the string/signal content changes.
- **Feature card count:** May remain at 4, or be reduced if four honest cards cannot be written. A reduction to 2–3 cards is acceptable as long as responsive layout still looks intentional on desktop, tablet, and mobile.

---

## Milestone Context

**Milestone:** None assigned. This is a `bug` fix follow-up to the landing-page work from Milestone #4 (Landing Page & Project Dashboard UI).

### Prerequisite Issues
- [#29](https://github.com/Gulybi/KanbAI-Web/issues/29) — Create Public Landing Page (Home View) — **CLOSED**. Established the landing-page scaffold and the original (hallucinated) copy that this issue cleans up.

### Downstream Issues
- None at time of writing. Future marketing-copy updates may be introduced once real capabilities land.

### Related Work (provides context for what is and is not yet real)
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) — Project Dashboard Component — **CLOSED** (this IS shippable and can be referenced honestly).
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) — New Project modal — **CLOSED** (shippable).
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) — Project Members Management UI — **CLOSED** (shippable).
- [#45](https://github.com/Gulybi/KanbAI-Web/issues/45) — Setup SignalR Client Service — **OPEN**. Real-time is NOT yet delivered; landing copy must not claim it is.
- [#46](https://github.com/Gulybi/KanbAI-Web/issues/46) — Integrate Real-time Events with State Management — **OPEN**.
- [#47](https://github.com/Gulybi/KanbAI-Web/issues/47) — Implement Visual Drag-and-Drop (Angular CDK) — **OPEN**. Interactive board is not yet delivered.
- [#48](https://github.com/Gulybi/KanbAI-Web/issues/48), [#49](https://github.com/Gulybi/KanbAI-Web/issues/49), [#50](https://github.com/Gulybi/KanbAI-Web/issues/50), [#51](https://github.com/Gulybi/KanbAI-Web/issues/51), [#52](https://github.com/Gulybi/KanbAI-Web/issues/52) — File upload / attachment work — **OPEN**. Attachment features are not yet delivered.
- [#59](https://github.com/Gulybi/KanbAI-Web/issues/59) — Fix Environment API URL Configuration — **OPEN**. Independent bug; not a prerequisite for this issue.

### Related Work — Copy-review rule of thumb
Any feature referenced in copy that maps to an OPEN issue above must be either removed from the landing page or clearly framed as a roadmap item. Any feature that maps to a CLOSED, shippable issue may be stated in the present tense.

---

## Acceptance Criteria

Each criterion below is observable in the rendered landing page (`/`) and testable by a human reviewer or automated DOM/spec test.

### Content accuracy — hallucinations removed

- [ ] **AC1 — Hero subheading is accurate:** The `<p>` beneath the hero headline on `/` no longer contains the phrases "intelligent automation", "real-time collaboration", or "data-driven insights". Its replacement describes the product in terms that match the currently shipped functionality (e.g., references to Kanban-style project management, collaboration for teams, or clearly framed forward-looking language such as "designed to…" / "we're building…").
- [ ] **AC2 — No claim of real-time sync:** No visible text on the landing page states or implies that boards update live across devices, that changes propagate in real time, or that collaboration is instantaneous. Strings matching the regex `/real[- ]?time|instant(ly)?|live (update|sync)/i` either do not appear, or appear only inside a "coming soon" / roadmap context that is visually distinguishable (e.g., a badge or explicit "Coming soon" label).
- [ ] **AC3 — No claim of machine-learning insights:** No visible text states or implies that the product uses machine learning, predicts sprint velocity, identifies bottlenecks, or optimises workflows automatically. Strings matching the regex `/machine learning|ml-|sprint velocity|bottleneck|predict|optimi[sz]e (your )?workflow/i` do not appear outside of a roadmap/coming-soon context.
- [ ] **AC4 — No claim of built-in chat / mentions / notifications:** No visible text states that the product has chat, @mentions, or notifications, outside of a roadmap/coming-soon context. Strings matching `/chat|@mention|mentions|notification/i` do not appear as current-capability claims.
- [ ] **AC5 — No claim of automation rules:** No visible text states that the product automates repetitive tasks or offers intelligent/adaptive rules, outside of a roadmap/coming-soon context. Strings matching `/automat(e|ion)|rules? that|adapt/i` do not appear as current-capability claims.
- [ ] **AC6 — Trust-indicator line is honest or removed:** The "No credit card required • Secure by default • Set up in minutes" line is either (a) removed entirely, or (b) replaced with statements that are verifiably true of the current product. "No credit card required" is acceptable only if the product is in fact free to try today; "Set up in minutes" is acceptable only if a reviewer can complete registration → dashboard in under 5 minutes in a manual test.
- [ ] **AC7 — Features section header matches tone of revised copy:** The "Why Choose KanbAI?" heading and its subheading do not overclaim. They either state what the product is (e.g., "What KanbAI offers") or are rewritten to match the honesty of the revised feature cards. The words "powerful features that transform" are removed.

### Content accuracy — feature cards

- [ ] **AC8 — Every feature card is either accurate or explicitly labelled roadmap:** For each feature card rendered in the features grid, its title AND description must describe either (a) a capability the reviewer can exercise in the current app after logging in (e.g., creating projects, managing members, the project dashboard), or (b) a roadmap item with a clearly visible "Coming soon" / "On the roadmap" / equivalent label directly attached to that card.
- [ ] **AC9 — Card count remains a layout-compatible number:** The features grid renders 2, 3, or 4 cards. The grid still displays without broken layout on desktop (≥1024 px), tablet (768–1023 px), and mobile (<768 px). (A reviewer resizing the browser confirms no empty grid cells, no single orphaned card on a row of 4, and no horizontal scroll.)
- [ ] **AC10 — No card references unimplemented specifics:** No feature card (title or description) mentions: machine learning, velocity prediction, bottleneck detection, in-app chat, @mentions, notifications, automation rules, or real-time cross-device sync, unless that card is explicitly flagged as roadmap per AC8.

### Preserved behaviour (regression guard)

- [ ] **AC11 — CTA buttons still work:** "Get Started Free" button on the hero navigates to `/register`; "Login" button navigates to `/login`. Both remain keyboard-activatable (Enter and Space) and retain visible focus indicators.
- [ ] **AC12 — Brand identity preserved:** The word "KanbAI" still appears as the hero brand (`<h1>`). The overall visual layout (hero on top, features grid below) is unchanged.
- [ ] **AC13 — Routing and guards unchanged:** Unauthenticated users still see the landing page at `/`; authenticated users are still redirected away by `unauthGuard` (verified by manually logging in and navigating to `/`).
- [ ] **AC14 — Heading hierarchy preserved:** There is exactly one `<h1>` on the page (the KanbAI brand), and section headings use `<h2>` / `<h3>` as they did before this change. Screen-reader landmark order is unchanged.
- [ ] **AC15 — Responsive layout preserved:** At widths 375 px (mobile), 768 px (tablet), and 1280 px (desktop), content fits without horizontal scroll and the features grid collapses correctly (1 / 2 / 4 columns respectively, or adjusted proportionally if card count changes per AC9).

### Quality gates

- [ ] **AC16 — No console errors on load:** Opening `/` in a fresh browser tab produces zero errors and zero warnings related to the landing page in the browser console.
- [ ] **AC17 — Existing landing-page unit tests still pass:** `landing-page.component.spec.ts`, `hero-section.component.spec.ts`, `features-section.component.spec.ts`, and `feature-card.component.spec.ts` continue to pass after the copy changes. Any tests that asserted on the old hallucinated strings are updated to assert on the new accurate strings (not deleted).
- [ ] **AC18 — Build succeeds:** `npm run build` in `KanbAI-Web/KanbAI-Web/` completes without errors.

### Edge cases

- [ ] **AC19 — Roadmap labels are accessible:** If any feature card is marked "Coming soon" (or equivalent), that label is programmatically associated with the card (e.g., via `aria-label` or as text inside the card) so a screen reader announces it when reading the card.
- [ ] **AC20 — Long-copy safety:** If a new feature description wraps to additional lines, the card height still looks intentional (cards in the same row are either equal height via the existing grid rules or visibly consistent). No description truncates or overflows visibly at any supported viewport width.

---

*Prepared by the product-manager agent as input for the staff-engineer phase.*
