# Feature: Public Landing Page (Home View)

**GitHub Issue:** [#29](https://github.com/Gulybi/KanbAI-Web/issues/29)  
**Milestone:** Landing Page & Project Dashboard UI (AI-Driven) (#4)

## Business Value

### Who is this for?
This feature is for **unauthenticated visitors** who land on the KanbAI platform for the first time. These are potential users who need to understand what KanbAI offers before deciding to sign up or log in.

### Why is it valuable?
Currently, the application redirects all visitors directly to the login page, creating a poor first impression and missing the opportunity to communicate the platform's value proposition. A well-designed landing page:
- Establishes brand identity and trust
- Clearly communicates the platform's AI-driven Kanban capabilities
- Reduces friction in the user acquisition funnel by educating visitors before signup
- Provides clear paths to authentication (login/register)

### What problem does it solve?
**Problem:** New visitors have no context about KanbAI's features or benefits before being forced to authenticate. This creates:
- Higher bounce rates from confused visitors
- Lower conversion rates (visitor → registered user)
- Missed opportunity to differentiate from generic Kanban tools

**Solution:** A compelling, modern landing page that showcases KanbAI's unique AI-driven features and guides visitors to take action.

---

## Current State vs Desired State

### Current State
- **Current routing:** `KanbAI-Web/src/app/app.routes.ts`
  - Root path (`/`) redirects immediately to `/login`
  - No public-facing content for unauthenticated users
  - Existing routes: `/login` and `/board`
- **Current behavior:** Visitors see the login page immediately with no context about the platform
- **Existing components:**
  - `KanbAI-Web/src/app/features/auth/login-page/login-page.component.ts` (authentication entry point)
  - `KanbAI-Web/src/app/features/board/board-page/board-page.component.ts` (authenticated user board)
  - Core layout components (navbar, sidebar) for authenticated users

### Desired State
- **Expected behavior:**
  - Root path (`/`) displays a responsive, modern landing page
  - Landing page is accessible to unauthenticated users only
  - Authenticated users accessing `/` are redirected to their dashboard/board
- **Expected user flow:**
  1. Visitor lands on root path (`/`)
  2. Sees hero section with KanbAI branding and value proposition
  3. Scrolls through feature highlights (real-time collaboration, AI-driven insights, etc.)
  4. Clicks CTA button to either:
     - "Login" → navigates to `/login`
     - "Get Started" / "Sign Up" → navigates to `/register` (to be created)
  5. Page is fully responsive (mobile, tablet, desktop)
  6. Modern, professional design using Tailwind CSS

---

## Milestone Context

**Milestone #4:** Landing Page & Project Dashboard UI (AI-Driven)

This milestone focuses on creating the public-facing and authenticated dashboard experiences. Issue #29 is the entry point for the milestone.

### Prerequisite Issues
- None - this is the first issue in the milestone

### Downstream Issues (blocked by this)
- [#30](https://github.com/Gulybi/KanbAI-Web/issues/30) - Implement Project Dashboard Component (OPEN)
- [#31](https://github.com/Gulybi/KanbAI-Web/issues/31) - Setup Project State Management with Signals (OPEN)
- [#32](https://github.com/Gulybi/KanbAI-Web/issues/32) - Create "New Project" Modal or Form (OPEN)
- [#33](https://github.com/Gulybi/KanbAI-Web/issues/33) - Implement Project Members Management UI (OPEN)

### Related Work
- The landing page will serve as the public entry point before users access the authenticated project dashboard (#30)
- Future `/register` route mentioned in CTA buttons (not yet implemented)

---

## Acceptance Criteria

- [ ] **Route Configuration:** Root path (`/`) renders the landing page component for unauthenticated users
- [ ] **Hero Section Visibility:** Hero section displays within 100ms of page load, containing:
  - KanbAI logo or brand name
  - Compelling headline explaining the platform (e.g., "AI-Powered Kanban Boards for Modern Teams")
  - Subheading with 1-2 sentences describing the value proposition
  - Minimum of 2 CTA buttons ("Login" and "Get Started" or "Sign Up")
- [ ] **Feature Highlights Section:** Page includes a section showcasing 3-5 key features with:
  - Feature title
  - Feature description (2-3 sentences each)
  - Visual representation (icon or illustration placeholder)
  - Examples: "Real-time Kanban Boards", "AI-Driven Insights", "Team Collaboration", "Smart Automation"
- [ ] **CTA Button Behavior:**
  - "Login" button navigates to `/login` route
  - "Get Started" / "Sign Up" button navigates to `/register` route (or shows coming-soon message if route doesn't exist)
  - Buttons are keyboard accessible (Enter/Space triggers navigation)
- [ ] **Responsive Design:**
  - Desktop (≥1024px): Hero and features displayed in multi-column layout
  - Tablet (768px-1023px): Features stack into 2-column grid
  - Mobile (<768px): All content stacks into single column, readable without horizontal scroll
- [ ] **Accessibility Compliance:**
  - All images/icons have appropriate `alt` text
  - Heading hierarchy is semantic (`<h1>` for main headline, `<h2>` for section titles, etc.)
  - Color contrast meets WCAG AA standards (4.5:1 for body text, 3:1 for large text)
  - Focus indicators visible on all interactive elements
- [ ] **Performance:** Landing page loads and becomes interactive within 2 seconds on 3G connection
- [ ] **Authentication State Handling:** If a user is already authenticated and navigates to `/`, they are redirected to `/board` or their dashboard (not shown the landing page)
- [ ] **Modern Styling:** Page uses Tailwind CSS utility classes for all styling (no custom CSS required unless specified by design)
- [ ] **No Console Errors:** Browser console shows no errors or warnings related to the landing page component

---

## Edge Cases & Error Handling

- [ ] **Missing Register Route:** If `/register` route doesn't exist, "Sign Up" button displays a tooltip or modal: "Registration coming soon! Please contact your administrator."
- [ ] **Slow Network:** Loading states or skeleton screens appear if feature images take >500ms to load
- [ ] **Screen Reader Support:** Page content is navigable and understandable using screen readers (NVDA, JAWS, VoiceOver)
