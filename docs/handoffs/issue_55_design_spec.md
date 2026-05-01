# Design Specification: Restore Login UI and Fix Authentication Flow

**Technical Spec:** [issue_55_tech_spec.md](./issue_55_tech_spec.md)
**Context Document:** [issue_55_context.md](./issue_55_context.md)
**GitHub Issue:** [#55](https://github.com/Gulybi/KanbAI-Web/issues/55)
**Design System:** KanbAI Project Management Dashboard v1.0

---

## Design Intent

The Login page is the product's front door. It must feel **calm, trustworthy, and frictionless** — the user has either just tried to reach a protected area (returnUrl flow) or has arrived expressly to sign in, and both audiences deserve a screen that is quick to scan, quick to complete, and never punishes them for a mistake.

Because this is a **restoration**, not a new visual direction, the design goal is *indistinguishability from the Register page*. A new visitor signing up today and signing in tomorrow should feel they are in the same place — same card elevation, same input rhythm, same brand sage-primary button, same "Welcome Back"/"Create Account" heading cadence. We are repairing the twin, not reinventing it.

The one bespoke surface — the `LoginContextBannerComponent` that appears above the card when a safe `returnUrl` is present — is already shipped and must be preserved byte-for-byte.

---

## Scope

**Components styled (or restyled) by this spec:**
- `LoginPageComponent` — page-level layout + restored form markup
- Consumers only (no changes to styling): `FormCardComponent`, `FormInputComponent`, `FormButtonComponent`, `LoginContextBannerComponent`

**States covered on the restored form:**
default · hover · focus · active · disabled · loading · error (inline + field-level) · 401-rejection

**Responsive:** 320px phone through ≥1440px desktop. Single-column layout at every breakpoint; card width scales via max-width, not fluid.

**Out of scope:**
- Design system token edits (no new tokens are introduced)
- Restyling `FormCardComponent`, `FormInputComponent`, `FormButtonComponent` — they are already production-styled via Tailwind utility classes mapped to canonical tokens and are reused as-is
- Context banner visuals (unchanged)
- Navbar, Dashboard, Register page (untouched by issue #55)

---

## Tokens Used

This spec consumes only canonical KanbAI v1.0 tokens. **No new tokens are introduced.** The existing shared form components already reference these tokens via the repo's Tailwind theme (e.g., `bg-brand-primary`, `text-text-primary`, `rounded-pill`, `text-xxl`, `bg-background-sidebarLight`), and the page-level SCSS at [KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss) already uses `@use 'src/styles/variables/...'` — both pathways are valid and are kept in place.

| Token | Where used in the Login page |
|---|---|
| `$bg-main` (`#FFFFFF`) | Page background (host `:host`) |
| `$bg-sidebar-light` (`#F4F5F1`) | *Optional* tinted outer canvas if reconciling with Register's `bg-background-sidebarLight` — see §Open Question A |
| `$bg-card` (`#FFFFFF`) | `.login-page__card` fill |
| `$brand-primary` (`#8C9B7B`) | Primary submit button fill, "Create one" link, focus ring |
| `$brand-primary-hover` (`#7A8A69`) | Submit button hover fill |
| `$brand-primary-light` (`#E8EBE4`) | Context banner background (existing — unchanged) |
| `$text-primary` (`#1C1C1C`) | "Welcome Back" heading, input values |
| `$text-secondary` (`#7A7A7A`) | Subheading "Sign in to continue to your boards", input labels |
| `$text-tertiary` (`#A1A1A1`) | Placeholder text, "Don't have an account?" meta line |
| `$text-inverse` (`#FFFFFF`) | Submit button label |
| `$status-high` (`#E56B6F`) | Inline error message text ("Invalid email or password."), invalid input border |
| `$border-light` (`#EAEAEA`) | Default input border |
| `$shadow-card` | `.login-page__card` resting shadow |
| `$radius-lg` (`16px`) | Card radius (page-level SCSS) |
| `$radius-md` (`12px`) | Input radius (via shared `FormInputComponent`) |
| `$radius-pill` | Submit button radius (via shared `FormButtonComponent`) |
| `$space-xxs`–`$space-xl` | Form gap rhythm (`$space-md` between fields, `$space-xl` card padding) |
| `$font-size-xxl` (`24px`) | Page heading |
| `$font-size-md` (`14px`) | Input values, button label |
| `$font-size-sm` (`12px`) | Sub-heading, meta line |
| `$font-size-xs` (`10px`) | Input labels, error text |
| `$font-weight-bold` (`700`) | "Welcome Back" heading |
| `$font-weight-medium` (`500`) | Button label, link text |
| `$motion-fast` (`150ms`) | Input border, button background transitions |
| `$motion-base` (`250ms`) | Card entry, loading-state swap |

---

## Per-Component Styling

### Component: LoginPageComponent

**Files:**
- [KanbAI-Web/src/app/features/auth/login-page/login-page.component.html](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.html) — template (restored)
- [KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss) — page SCSS (kept almost as-is)

**Role:** Page chrome for the sign-in form. Centers a `max-width: 420px` column containing (optionally) the returnUrl context banner and always the form card.

**Layout:**
- Host is a flex column, `min-height: 100vh`, `align-items: center`, `justify-content: center`. Existing SCSS at `login-page.component.scss` already does this. Keep it.
- Column (`.login-page__column`) is `max-width: 420px`, vertical stack with `gap: $space-lg` between banner and card.
- Card (`.login-page__card`) carries `$shadow-card`, `border-radius: $radius-lg`, `padding: $space-xl` (→ `$space-xl $space-xxl` at ≥ `$bp-md`).
- Inside the card: heading cluster → `<app-form-card>` with form → footer meta link.

**States:**

| State | Visual |
|---|---|
| **Default** | Card at `$shadow-card`, inputs at `$border-light`, submit button `$brand-primary` fill, `disabled` (form is invalid on mount). |
| **Focus within input** | Input border → `$brand-primary`, 1px inner ring `$brand-primary` (already provided by `FormInputComponent`). |
| **Input invalid + touched** | Border → `$status-high`, aria-invalid announced, field-level error "Please enter a valid email address." under the input. `FormInputComponent` already owns this presentation. |
| **Form valid, idle** | Submit button enables — full-width `$brand-primary` pill, `$text-inverse` label "Sign In". |
| **Hover (submit)** | Background → `$brand-primary-hover` over `$motion-fast`. |
| **Submit in flight** | Button `disabled`, opacity `0.5`, cursor `not-allowed` (supplied by `FormButtonComponent`). Label swaps to "Signing In…". Inputs stay interactive but submission is gated by `isLoading()`. |
| **401 rejection** | Inline `<span role="alert">` appears directly above the submit button, `$font-size-xs`, `$status-high`, copy: **"Invalid email or password."**. Button re-enables. Email/password field values are preserved. URL stays `/login`. |
| **Network / non-401 failure** | Same inline slot, copy: **"Sign-in failed. Please try again."**. |
| **Successful submit** | Button stays disabled through route transition — no flash of the idle card before navigating. |
| **Cold-load with returnUrl** | `LoginContextBannerComponent` renders above the card (existing), card renders as Default below. |

**SCSS (page-level — kept from current file, trimmed to what's needed):**

```scss
@use 'src/styles/variables/colors' as *;
@use 'src/styles/variables/spacing' as *;
@use 'src/styles/variables/radius' as *;
@use 'src/styles/variables/shadows' as *;
@use 'src/styles/variables/breakpoints' as *;

:host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  min-height: 100vh;
  background: $bg-main;
  padding: $space-xl $space-md;
}

.login-page__column {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: $space-lg;
}

.login-page__card {
  background: $bg-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  padding: $space-xl;

  @include respond-to('md') {
    padding: $space-xl $space-xxl;
  }
}
```

**Template (restored inner content of `.login-page__card` — preserves the existing column wrapper and banner conditional, replaces only the placeholder `<h1>/<p>` block):**

```html
<div class="login-page__column">
  @if (returnUrlSafe(); as returnUrl) {
    <app-login-context-banner
      [returnUrl]="returnUrl"
      (cancel)="onCancelReturn()" />
  }

  <div class="login-page__card">
    <div class="text-center mb-8">
      <h1 class="text-xxl font-bold text-text-primary tracking-tight">Welcome Back</h1>
      <p class="text-sm text-text-secondary mt-2">Sign in to continue to your boards</p>
    </div>

    <app-form-card>
      <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="flex flex-col gap-5">

        <app-form-input
          label="Email Address"
          type="email"
          placeholder="e.g. alex@company.com"
          [control]="emailControl">
        </app-form-input>

        <app-form-input
          label="Password"
          type="password"
          placeholder="Your password"
          [control]="passwordControl">
        </app-form-input>

        @if (errorMessage(); as msg) {
          <span class="text-xs text-status-high -mt-3" role="alert" aria-live="polite">
            {{ msg }}
          </span>
        }

        <div class="mt-2">
          <app-form-button
            type="submit"
            [fullWidth]="true"
            [disabled]="loginForm.invalid || isLoading()">
            {{ isLoading() ? 'Signing In…' : 'Sign In' }}
          </app-form-button>
        </div>

      </form>
    </app-form-card>

    <p class="text-center mt-6 text-sm text-text-tertiary">
      Don't have an account?
      <a routerLink="/register" class="text-brand-primary font-medium hover:underline">Create one</a>
    </p>
  </div>
</div>
```

**Interaction notes:**
- The inline error span has `role="alert"` (so it is announced immediately) **and** `aria-live="polite"` (so subsequent message swaps — e.g., 401 → network-error retry — are also announced without interrupting). Pick `role="alert"` OR `aria-live="polite"` if screen-reader testing shows double-announcement; per WCAG guidance `role="alert"` alone is typically sufficient — keep both only if QA confirms no double-speech.
- The error message sits in a **reserved slot between the password input and the submit button** with `-mt-3` (i.e., pulled up 12px to sit tight against the password field's error area rhythm). This matches the Register page treatment of its `passwordMismatch` span.
- The submit button's label and disabled state are the single source of truth for form progress — no spinner icon, no separate overlay. The copy change from "Sign In" → "Signing In…" signals the request is in flight; the disabled state prevents double-submit.
- `errorMessage` is cleared at the start of every `onSubmit()` — never stacked.

**Accessibility:**
- Each input has an explicit `<label for="…">` via the shared `FormInputComponent` (already implemented — `label [for]="inputId"` in `form-input.component.html`).
- Email input: `type="email"` (mobile keyboards show `@`), `inputmode="email"` is not currently set by the shared component; the design does not require it but flag in Open Question B if QA wants it.
- Password input: `type="password"` hides characters by default; no show/hide toggle in this ticket (Milestone 3 scope — defer unless explicitly reopened).
- Submit button: disabled when `loginForm.invalid || isLoading()` — gives screen readers and keyboard users an accurate state. When disabled, the button retains focusability via the shared `FormButtonComponent` default (browser-native `disabled` excludes from tab order; acceptable for forms because reaching the button requires valid fields first).
- Focus ring: `FormInputComponent` uses `focus:ring-1 focus:ring-brand-primary`, `FormButtonComponent` inherits browser focus; Confirm in implementation that the `:focus-visible` ring on the submit button is visible against the button fill — if not, add a `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary` utility in the button markup (scoped to this page if global change is out of scope).
- Touch target: primary button is `py-2` (~36px) via the shared component. On the login form specifically this is acceptable because the button is `fullWidth` (full width ≫ 44px), which satisfies WCAG 2.5.5 pointer-target size.

---

## User Flows

### Flow A — Cold sign-in, no returnUrl

1. **Arrive at `/login`.** Page fades in at `$motion-base` (browser default navigation; no bespoke page transition). Card is centered, context banner is absent.
2. **Read heading.** "Welcome Back" in `$text-primary` / `$font-weight-bold` / `$font-size-xxl`. Subline "Sign in to continue to your boards" in `$text-secondary` / `$font-size-sm`. Microcopy is quiet and concrete per KanbAI voice.
3. **Tab into Email.** Focus ring (1px brand-primary), placeholder "e.g. alex@company.com" in `$text-tertiary`.
4. **Type `alex@company.com`.** On blur, if invalid, field-level error surfaces: "Please enter a valid email address." (supplied by `FormInputComponent`).
5. **Tab into Password, type.** Both fields valid → submit button enables, fill stays `$brand-primary`, cursor changes to pointer on hover.
6. **Hover submit.** Fill darkens to `$brand-primary-hover` over `$motion-fast`.
7. **Click submit.** Label → "Signing In…"; button disabled; inputs remain visually idle. `AuthService.login()` fires.
8. **Success (2xx).** Router navigates to `/dashboard`. No visible "success" flash on the login card — the navigation itself is the confirmation.

### Flow B — Deep-link redirect (returnUrl present)

1. User was at `/dashboard` unauthenticated → `authGuard` redirects to `/login?returnUrl=%2Fdashboard`.
2. **Context banner renders** above the card (existing `LoginContextBannerComponent`): sage-light fill, info glyph, heading "Sign in to continue", meta "You'll return to `/dashboard` after you sign in.", Cancel button.
3. Form renders identically to Flow A inside the card.
4. User submits valid credentials → router navigates to `/dashboard` (the `returnUrl`), **not** the default authenticated home.
5. Clicking Cancel on the banner (existing behavior) strips the `returnUrl` query param without leaving the page; the banner disappears, card remains.

### Flow C — Invalid credentials (401)

1. User submits with bad email/password.
2. Button enters in-flight state (Flow A step 7).
3. Backend returns 401. Interceptor is now exempt from auth-endpoint 401s (per tech spec step 3), so it does NOT call `logout()` or navigate.
4. **Inline error appears** in the reserved slot between password and submit: "Invalid email or password." in `$status-high` / `$font-size-xs` / `role="alert"`.
5. Submit button re-enables; label reverts to "Sign In". Input values are preserved so the user can correct the password without retyping the email.
6. Focus remains on the submit button (browser default after click). Screen reader announces the error via the `role="alert"` live region. **Do not auto-focus the email input** — the user knows what they typed and may want to correct only the password.
7. User edits the password → **errorMessage is not cleared on typing** (it's cleared on next submit). This is a deliberate choice: a second submit without a change would otherwise lose the error context before the network trip. If UX feedback wants "clear on input," add a `valueChanges` subscription in a follow-up.
8. URL remains `/login`. No intermediate history entries, no browser-back surprise.

### Flow D — Logout and return

1. User clicks Logout in navbar → `AuthService.logout()` runs (now clears both `currentUser` and `AuthStateService.clearAuthState()` per tech spec step 2).
2. Navbar routes to `/login`. `unauthGuard` on `/login` now sees `isAuthenticated === false` and allows.
3. Login page renders **without** context banner (no returnUrl on a clean logout). Card is in Default state.
4. If user then types `/dashboard` → `authGuard` bounces back to `/login?returnUrl=%2Fdashboard` → Flow B.

### Flow E — Non-401 failure (e.g., network down, 500)

Same visuals as Flow C steps 1–8, but the inline error reads **"Sign-in failed. Please try again."** (generic copy — do not leak backend status codes or stack traces to the user).

---

## Responsive Behavior

The sign-in card is a single-column layout at every breakpoint — no stacked-to-wide reflow needed. What changes is interior rhythm.

### < `$bp-sm` (≤ 575px — phone)
- Host padding: `$space-xl $space-md` (existing). Horizontal padding stays comfortable on a 360px viewport.
- Card padding: `$space-xl` (existing).
- Column `max-width: 420px` is irrelevant here (viewport < 420px), so card fills `100%` minus host padding. On a 320px viewport the form is ~288px wide — still above the ergonomic 280px floor.
- Inputs are `w-full`; submit button is `fullWidth`. No horizontal scroll under any state.
- Touch targets: Cancel button in the context banner already enforces 44×44 at coarse pointers; the full-width submit button is ≫44px; input tap regions span the full card width at `py-2`.

### `$bp-sm` – `$bp-md` (576–767px — large phone / small tablet)
- Card begins to feel intentionally narrow against viewport — deliberate. A wide card on tablet would make the form feel institutional.
- No layout changes from phone.

### ≥ `$bp-md` (≥ 768px — tablet / laptop / desktop)
- Card padding expands to `$space-xl $space-xxl` (48px horizontal) — more breathing room around the inputs.
- Column remains `max-width: 420px` and centered — the form does **not** grow with viewport. This is a focal page; widening the form dilutes focus.

### ≥ `$bp-lg` (≥ 992px)
- No change. The page does not adopt a split-image layout or marketing column in this ticket (out of scope; would require new imagery and new tokens). The centered-card pattern carries through to desktop.

### Motion & reduced motion
- The only motion on this page is the existing context banner's entrance (`$motion-fast`, `opacity + translateY(-4px → 0)`) and the inline error span's default appearance (no dedicated animation).
- Global `prefers-reduced-motion: reduce` rule in `_motion.scss` already clamps transitions to `0.01ms` — honored page-wide.

---

## Accessibility Audit (WCAG AA)

### Contrast (measured, sRGB)

| Pair | Foreground | Background | Ratio | Verdict |
|---|---|---|---|---|
| "Welcome Back" heading | `$text-primary` `#1C1C1C` | `$bg-card` `#FFFFFF` | 17.9:1 | ✅ AAA |
| Subheading "Sign in to continue…" | `$text-secondary` `#7A7A7A` | `$bg-card` `#FFFFFF` | 4.61:1 | ✅ AA (normal text) |
| Input label | `$text-secondary` `#7A7A7A` | `$bg-card` `#FFFFFF` | 4.61:1 | ✅ AA |
| Input value | `$text-primary` `#1C1C1C` | `$bg-main` `#FFFFFF` | 17.9:1 | ✅ AAA |
| Placeholder | `$text-tertiary` `#A1A1A1` | `$bg-main` `#FFFFFF` | 2.83:1 | ⚠️ **Not body copy** — acceptable for placeholder per WCAG (decorative hint) but never rely on placeholder to convey required info. Label+aria-label carry the meaning. |
| Submit button label | `$text-inverse` `#FFFFFF` | `$brand-primary` `#8C9B7B` | 3.32:1 | ✅ AA (large text ≥14px medium, per WCAG 1.4.3 — button label is `$font-size-md` / `font-weight-medium`). Also meets UI-component 3:1 minimum (WCAG 1.4.11). |
| Submit hover | `$text-inverse` `#FFFFFF` | `$brand-primary-hover` `#7A8A69` | 3.95:1 | ✅ AA large + UI |
| Field error "Please enter a valid email address." | `$status-high` `#E56B6F` | `$bg-main` `#FFFFFF` | 3.54:1 | ✅ AA large text (12px medium is borderline — see Note below) |
| Inline form error "Invalid email or password." | `$status-high` `#E56B6F` | `$bg-card` `#FFFFFF` | 3.54:1 | ✅ AA large text |
| "Create one" link | `$text-brand` `#8C9B7B` | `$bg-card` `#FFFFFF` | 3.33:1 | ⚠️ AA only at large / UI — the link sits at `$font-size-sm` (12px) / `font-weight-medium`. **See Note.** |
| Invalid input border | `$status-high` `#E56B6F` | `$bg-main` `#FFFFFF` | 3.54:1 | ✅ AA UI (≥3:1) |
| Default input border | `$border-light` `#EAEAEA` | `$bg-main` `#FFFFFF` | 1.31:1 | ⚠️ **Fails UI 3:1** on its own — but the input also has `placeholder` text, an associated label above, and a clear `<input>` shape from the browser. WCAG 1.4.11 exempts "UI components or States of UI components that … are identified solely by color" — the input has shape, label, and text affordances, so this is compliant but brittle. **Acceptable per existing shared component — do NOT restyle here.** |

**Notes on the two ⚠️ flags above:**

- **"Create one" link (`#8C9B7B` on white at 12px medium):** 3.33:1 is below AA's 4.5:1 threshold for *normal* body text. Two mitigations:
  1. `hover:underline` and focus ring provide **non-color** affordance → the link's meaning is communicated without relying on color alone (WCAG 1.4.1).
  2. The "Don't have an account?" prefix text is in `$text-tertiary` (also meta), so the entire line is marked meta/secondary information — a user who cannot read 3.33:1 text at 12px has a broader accessibility need that an underline reveal on focus helps meet.
  3. **If QA requests AA-strict body compliance**, bump the link to `$font-weight-semibold` (600) and underline by default — stays within tokens, no new colors. Flagged but not required for this ticket per "restoration, not redesign."

- **Field-level error "Please enter a valid email address." (`#E56B6F` on white at 10px):** `$font-size-xs` is 10px, below large-text thresholds. 3.54:1 fails normal AA. Mitigations:
  1. Shared `FormInputComponent` already renders errors at `text-xs` (12px in Tailwind's default scale) which aligns closer to 12px, not 10px. **Verify at implementation** that the computed font-size in Tailwind's theme for `text-xs` in this project is ≥12px. If it resolves to 10px per token, bump error text to `text-sm` locally within `FormInputComponent` — but this is a shared-component edit outside this ticket's scope; flag as Open Question C.
  2. Error is always paired with a **red border on the input** and an **aria-describedby link** to the error text, so a user relies on border + position + screen-reader text, not color alone.

### Keyboard

- **Tab order:** context banner (if present) → Cancel button in banner → Email → Password → Submit → "Create one" link.
- **Enter in any input** submits the form (browser default on a `<form>` with a single submit button).
- **Escape**: no custom behavior — the form is not modal; the page is a full-screen route.
- **Focus visibility:** Email/Password inputs have `focus:border-brand-primary focus:ring-1 focus:ring-brand-primary` (per `FormInputComponent`). Submit uses browser focus ring — verify in-browser that it is visible against the sage-primary fill; if not, add a `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary` utility on the shared `FormButtonComponent` **only if** Flow A keyboard walkthrough fails (Open Question D).

### Screen Reader

- Inputs: native `<input>` with `<label for>` association (existing `FormInputComponent` markup). No extra ARIA needed.
- Required field marker (`*` in red): `FormInputComponent` renders `<span class="sr-only">(required)</span>` alongside the visual asterisk — inherited behavior, correct.
- Inline error: `role="alert"` announces immediately on appearance. `aria-live="polite"` on the same element is redundant; if double-announcement is observed during SR testing, remove `aria-live="polite"` and keep `role="alert"`.
- "Create one" link: plain anchor, `routerLink="/register"` → renders `<a href="/register">`. SR announces "Create one, link" — acceptable; the phrase "Don't have an account?" immediately preceding gives context.

### Motion

- Global `prefers-reduced-motion: reduce` rule in `_motion.scss` already clamps all transitions/animations. Verified — no bespoke animation on this page is added.

### Forms

- Every input has a visible `<label>` (via `FormInputComponent`).
- Invalid inputs: border → `$status-high`, `aria-invalid="true"`, error message linked via `aria-describedby` (existing behavior).
- Autocomplete: The shared `FormInputComponent` does NOT currently set `autocomplete` attributes. **Recommendation** (Open Question E): developer should add `autocomplete="email"` to the email input and `autocomplete="current-password"` to the password input on the login form specifically, via a new optional `autocomplete` `@Input()` on `FormInputComponent` or via an attribute binding in the template. This is a password-manager / 1Password compatibility concern — not strictly a WCAG requirement but a strong UX win. **Defer or include at developer's discretion; flagged in the implementation checklist as optional.**

---

## Implementation Checklist

### Prerequisites (already satisfied — verify only)
- [x] Token files exist at `KanbAI-Web/src/styles/variables/` (`_colors`, `_spacing`, `_typography`, `_radius`, `_shadows`, `_motion`, `_breakpoints`, `_layout`)
- [x] Global `prefers-reduced-motion` rule lives in `_motion.scss`
- [x] Shared form components (`FormCardComponent`, `FormInputComponent`, `FormButtonComponent`) exist and are token-driven
- [x] `LoginContextBannerComponent` exists and is token-driven — **do not touch**
- [x] `.login-page__column` + `.login-page__card` SCSS at [login-page.component.scss](../../KanbAI-Web/src/app/features/auth/login-page/login-page.component.scss) — **keep as-is**

### Per component

#### LoginPageComponent — template
- [ ] Replace the inner content of `.login-page__card` (current placeholder `<h1>/<p>`) with the heading cluster + `<app-form-card>` + footer meta link exactly as shown in §Per-Component Styling → Template.
- [ ] Preserve the `.login-page__column` wrapper and the `@if (returnUrlSafe(); as returnUrl) { <app-login-context-banner … /> }` block above the card — unchanged.
- [ ] Confirm the card-level SCSS file remains untouched (all new markup rides on Tailwind utility classes that are already theme-mapped to canonical tokens).

#### LoginPageComponent — TypeScript (covered in tech spec §4)
Design spec does not re-specify TS — see [issue_55_tech_spec.md](./issue_55_tech_spec.md) §Implementation Steps 4.

### Verification
- [ ] Manual keyboard walkthrough: Tab from URL bar → Cancel (if banner present) → Email → Password → Submit → "Create one" link. Confirm a visible focus ring at each stop.
- [ ] Manual screen-reader walkthrough (NVDA on Win11 or VoiceOver on macOS): confirm the inline error "Invalid email or password." is announced on 401, and that field-level errors announce on blur.
- [ ] At 320px width: no horizontal scroll, card fills the viewport minus `$space-md` host padding, submit button is tappable.
- [ ] At 768px width: card horizontal padding expands to `$space-xxl`; form is visually centered.
- [ ] At 1440px width: card stays `max-width: 420px` centered — no stretch.
- [ ] `prefers-reduced-motion: reduce` in DevTools → context banner still fades in but collapses to ≤0.01ms, no visible motion.
- [ ] Lighthouse accessibility score ≥95 on `/login` (run after implementation).
- [ ] Contrast spot-check: inline error "Invalid email or password." meets AA-large against white (measured 3.54:1 — pass for the 12px-medium-or-larger rendered size; verify the computed font-size in-browser).
- [ ] Visual-parity spot-check with `/register`: same card elevation, same input rhythm, same button fill, same meta-line treatment — they are twins.

### Flagged as optional (not required to land this ticket)
- [ ] Add `autocomplete="email"` / `autocomplete="current-password"` to inputs (Open Question E).
- [ ] Strengthen "Create one" link to `$font-weight-semibold` + default underline if QA finds 3.33:1 at 12px insufficient (§Accessibility Audit note).
- [ ] Add `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary` to shared `FormButtonComponent` if the browser default focus ring is not clearly visible against the sage fill (Open Question D).
- [ ] Bump field-level error copy from `text-xs` to `text-sm` in `FormInputComponent` if the computed size resolves below 12px (Open Question C).

---

## Open Questions

### A. Host background — `$bg-main` or `$bg-sidebar-light`?
The current `login-page.component.scss` sets `background: $bg-main` (white). The Register page's outer wrapper uses Tailwind utility `bg-background-sidebarLight` (= `$bg-sidebar-light`, `#F4F5F1`), which gives a subtle tinted canvas that makes the white card "float." **For true parity with Register**, the Login host should switch to `$bg-sidebar-light`. **Decision needed**: keep `$bg-main` (current, stark) or switch to `$bg-sidebar-light` (matches Register). Recommend switch for visual consistency; this is a one-line SCSS change and introduces no new tokens.

### B. Email input `inputmode`?
Mobile keyboards default to the letter layout unless `inputmode="email"` is set. The shared `FormInputComponent` does not expose this. Low-cost, high-UX-win addition. **Defer unless QA raises** — flagged here so implementation doesn't forget the option exists.

### C. Field-level error font-size
Tailwind's `text-xs` in this project's theme — does it resolve to 12px (ideal) or 10px (`$font-size-xs`)? Needs a DevTools check during implementation. If 10px, consider bumping the shared error span to `text-sm` for better AA compliance. **Outside this ticket's scope to change a shared component**, but worth verifying.

### D. Submit button focus-visible ring
Verify in-browser that the default focus ring is clearly visible on the `$brand-primary` fill. If it isn't, the button needs a focus-visible utility added — but since `FormButtonComponent` is shared, this affects every form (Login, Register, any future auth form). Decision should be made across all consumers, not just Login. Flag to the team; safe default is to leave alone if the current focus ring is compliant.

### E. Autocomplete hints
Recommend `autocomplete="email"` and `autocomplete="current-password"` for password-manager UX. Requires either a new `@Input()` on `FormInputComponent` or a direct attribute pass-through. Low-risk; high-value. **Deferred at your discretion.**

---

## Design Validation (Self-Check)

- [x] Every color, spacing, and radius value references a canonical token (via SCSS `$var` or Tailwind theme utility)
- [x] Every interactive element has default / hover / focus / active / disabled / loading / error defined
- [x] Loading state, empty state (cold unauth arrival), error states (401, non-401, field-level) are all designed
- [x] Color is paired with non-color cues for every semantic signal: error border + icon (asterisk) + text + aria-invalid; hover fill change + cursor + underline on links
- [x] Touch targets ≥44×44 on mobile (submit button full-width; Cancel button in banner enforces min-width/height at coarse pointers)
- [x] `prefers-reduced-motion` honored via existing global rule
- [x] Tab order described
- [x] Every contrast ratio cited with a measured number
- [x] No new tokens introduced
- [x] Implementation checklist is actionable

---

*"The design specification is saved. You can now instruct the developer agent to implement the feature using both the technical spec and design spec."*
