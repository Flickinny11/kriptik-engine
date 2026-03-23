# Plan: KripTik Dependency Management System

## Overview

KripTik is an autonomous multi-agent app-building platform. When KripTik's agents build an app for a user, that app needs external dependencies — databases (base, PlanetScale), hosting (Vercel, Cloudflare), auth (Clerk, Auth0), payments (Stripe), AI services (OpenAI, Replicate, fal.ai), and dozens more.

This system solves: how does KripTik programmatically connect users to these dependencies, create accounts under the USER's name (not KripTik's), manage subscriptions, and give users a unified dashboard to control everything?

**The architecture has two layers:**

**Layer 1 — MCP Client (handles ~80%+ of dependencies):** The Model Context Protocol (MCP) is an open standard (now under the Linux Foundation) that standardizes how AI applications connect to external services. Most major developer platforms now have MCP servers. KripTik implements a single MCP client with OAuth 2.1 + PKCE that can connect to ANY MCP-enabled service via one-click. The user clicks "Connect" on a planning tile, authenticates directly with the service (creating an account if they don't have one — the service handles this during OAuth), and KripTik receives scoped tokens to manage reces on their behalf. The account is always under the user's identity because THEY authenticated.

**Layer 2 — Browser Agent Fallback (handles ~20% of dependencies):** For services that don't have MCP servers, KripTik uses Browser Use (open source, MIT, 81k+ GitHub stars, 89.1% accuracy on web tasks) to automate account signup. The agent fills out the signup form with the user's info (with explicit approval shown in chat), handles email verification via the user's connected email MCP, and prompts the user to paste SMS codes if needed. This fallback runs once per user per service and costs roughly $0.08-0.10 per signup.

**The user-facing surface is the Dependency Management View** — a new "Dependencies" item in the popout menu (present on ALL popout menu variants). This view lets users browse a catalog of services, connect with one click, manage subscriptions/billing/API keys per dependency, see which projects use which dependencies, and manage everything from one place. Users who leave KripTik can keep  for $10/mo as a standalone "Dependency Hub."

## Design Rules — ABSOLUTE, NON-NEGOTIABLE

Before writing ANY UI code for any task, read `/Volumes/T7Touch/Design_Reference.md` from start to finish. It is the authoritative design bible. Follow these rules without exception:

- Use ONLY the dependencies/libraries specified in Design_References.md — do not introduce alternatives
- NO Lucide React icons anywhere — they are banned from KripTik
- NO emojis anywhere in the UI
- All service logos and icons must be real, branded, full-color, highest quality — use simple-icons, devicons, or fetch official SVGs. If a library is needed, install it.
- NO flat design — every surface must have visible depth: shadows, gradients, subtle edges, glow effects, layered elements
- Butter smooth transitions at 60fps — no layout shifts, no jank
- Fully responsive: desktop (1920px, 1440px, 1024px), tablet (768px), mobile (390px, 375px)
- The aesthetic is warm, dimensional, stylish — NOT generic "AI slop" with flat carray backgrounds
- NO stubs, NO placeholders, NO "Coming soon" text, NO TODO comments — everything rendered must be real and functional
- If something cannot be fully implemented in this task, omit it entirely rather than stubbing it

## Session Rules — EVERY CLAUDE CODE SESSION MUST DO THIS

1. Read CLAUDE.md first to understand project state and what previous tasks accomplished
2. Read /Volumes/T7Touch/Design_Reference.md before writing any UI/component code
3. Before finishing: update CLAUDE.md with what you built, key files created, and any decisions made
4. Run all validation commands before marking task complete

## Validation Commands
- `npm run build`
- `npm run lint`
- `npm run type-check`

---

### Task 1: MCP Client Core — The Universal Connector

**Goal:** Build KripTik's MCP client that can connect to any MCP-enabled service with a single implementation. This one client replaces the need for per-service OAuth integrations.

**Architectural context:**

The MCP authorization spec (adopted Ma25, now standard) works like this:
1. KripTik's client tries to connect to a service's MCP server URL (e.g., `mcp.supabase.com/mcp`)
2. The server responds with HTTP 401 + a `WWW-Authenticate` header containing a `resource_metadata` URL
3. The client fetches the Protected Resource Metadata document (RFC 9728) from `/.well-known/oauth-protected-resource` — this tells the client which authorization server to use and what scopes are available
4. The client fetches Authorization Server Metadata (RFC 8414) from `/.well-known/oauth-authorization-server` to discover endpoints (authorize, token, registration)
5. If the client doesn't have a client_id for this server, it uses Dynamic Client Registration (RFC 7591) to automatically register and get one
6. The client initiates OAuth 2.1 with PKCE — redirects the user's browser to the service's auth page
7. The user authenticates (creating an account if needed — the service handles that), consents to the requested scopes
8. The client receives an authorization cochanges it for access + refresh tokens
9. The client calls `tools/list` on the MCP server to discover what tools are available
10. Tokens are stored encrypted, keyed by user ID + service ID

**What to build:**
- A `McpClient` class/module that implements the full flow above
- Token storage with encryption — access tokens, refresh tokens, scopes, expiry, per user per service
- Automatic token refresh when access tokens expire
- Re-auth flow when refresh tokens are revoked
- The `tools/list` call after successful connection to discover and cache available tools
- TypeScript types for everything: connection state, token payloads, service metadata, tool schemas

**Key decisions:**
- All tokens belong to the USER, not to KripTik — if the user leaves, their tokens are revoked but their account at the service still exists
- Token storage must be server-side and encrypted, never exposed to the client browser
- The MCP client is a server-side module — the browser only sees connection status, never tokens
- Resindicators (RFC 8707) must be included in token requests to scope tokens to specific MCP servers

- [x] Implement the full MCP OAuth 2.1 + PKCE authorization flow
- [x] Implement Protected Resource Metadata discovery
- [x] Implement Authorization Server Metadata discovery
- [x] Implement Dynamic Client Registration
- [x] Implement token storage (encrypted, per-user, per-service)
- [x] Implement automatic token refresh and re-auth
- [x] Implement `tools/list` discovery and tool schema caching
- [x] Build TypeScript types for all MCP-related data structures
- [x] Verify build passes
- [x] Update CLAUDE.md with what was built
- [x] Mark completed

### Task 2: Service Registry — The Dependency Catalog Data Layer

**Goal:** Create a comprehensive registry of developer services that KripTik users can connect to. This powers both the dependency catalog UI and the agent's knowledge of what tools are available for app building.

**Architectural context:**

Every service in the registry needs:
- **Identity:** name,lug, description, official website URL
- **Visual:** logo (real branded SVG, full color — fetch from simple-icons or official brand assets), brand primary color (for accent theming in the dashboard)
- **Category:** one of: database, hosting, auth, payments, email, monitoring, ai-ml, design, communication, storage, analytics, devtools, other
- **MCP status:** has MCP server (with URL) or does not (fallback required)
- **Pricing:** array of tiers with name, price, and short description (e.g., `{name: "Free", price: 0, description: "500MB database, 50K monthly active users"}`)
- **Instance model:** how this service relates to KripTik projects — "project-per-project" (Supabase, Vercel — each KripTik project gets its own project/instance at the service), "api-key-per-project" (fal.ai, Replicate — same account but separate API keys for billing visibility), or "shared" (monitoring tools like Sentry where one project covers all)

**Services to include (minimum — add more if you find them):**

MCP-enabled  Supabase (`mcp.supabase.com/mcp`), Vercel, Cloudflare, GitHub, Stripe, MongoDB Atlas, Clerk, Neon, Upstash, Sentry, Linear, Notion, Slack, Atlassian/Jira, Figma

Non-MCP / fallback required (Layer 2): fal.ai, Replicate, RunPod, Render, Railway, Fly.io, DigitalOcean, Heroku, Twilio, SendGrid, Resend, Postmark, AWS (partial MCP), Firebase/GCP, Pinecone, Qdrant

Search the web to verify which services currently have MCP servers as of March 2026 — the ecosystem is growing fast and some of these may have added MCP since this plan was written.

- [x] Create the service registry data structure and types
- [x] Populate with 30+ real services across all categories with accurate MCP server URLs
- [x] Include real pricing tier data for each service (fetch from their websites if needed)
- [x] Install simple-icons or equivalent and verify branded logos are available for each service
- [x] Create category definitions with display metadata
- [x] Build a "custom MCP server" entry type for user-added servers
- [x] Verify build passes
- [x] Update CLAUDE.md
- [x] Mark completed

### Task 3: Connect Flow — One-Click from Planning Tiles and Catalog

**Goal:** Build the user-facing connect experience that works in two contexts: (1) from a planning tile when KripTik's agents determine a dependency is needed, and (2) from the dependency catalog when users browse and add services.

**Architectural context — the planning tile flow:**

When KripTik's agents are planning an app build, they identify needed dependencies and create planning tiles. Each tile for an external dependency has a "Connect" button. When clicked:

1. Check if this service has an MCP server (from the registry)
2. **If MCP available:** Initiate the MCP OAuth 2.1 flow (Task 1). A popup/new tab opens the service's auth page. User logs in or creates account, consents to permissions, popup closes. KripTik now has tokens. A notification in the chat says: "Connected to Supabase! For your video app, the Free tier works for now. If you need more later, you can upgrade  Dependencies in the menu or I'll let you know in chat if a build needs it."
3. **If no MCP server:** Show an approval dialog: "[Service name] doesn't support one-click setup. KripTik will create an account for you using your email ([user's email]). You'll need to approve the signup. Continue?" → User approves → Browser agent fallback runs (Task 4) → Reports back when done
4. After connection: create the appropriate instance for the current project (new Supabase project, new API key for fal.ai, etc. — based on the service's instance model from the registry)

**The connect button component needs to handle these states:**
- Disconnected (not connected to this service at all)
- Connecting (OAuth flow in progress or browser agent running)
- Connected (tokens valid, tools discovered)
- Error (auth failed, token expired, service down)
- Needs upgrade (connected but current tier insufficient for the build)

**Key UX decisions:**
- After connecting, show the user what subscription tier the agent recommends  with the option to choose differently
- Always show pricing before creating an account — no surprises
- The user must explicitly approve any account creation and any payment method attachment
- Show real-time progress during the browser agent fallback ("Filling out signup form..." → "Waiting for email verification..." → "Account created!")

- [x] Build the ConnectButton component that handles both MCP and fallback flows
- [x] Implement the OAuth popup/redirect flow for MCP connections
- [x] Build the approval dialog for browser agent fallback
- [x] Build the subscription tier selector shown after connection
- [x] Build the connection status indicator with real branded logos
- [x] Wire into planning tile context — the connect button must work when rendered inside a planning tile
- [x] Implement post-connection instance creation logic (project-per-project vs api-key-per-project vs shared)
- [x] Style everything per Design_References.md — depth, glow, smooth state transitions
- [x] Verify build passes, update CLAUDE.md
- [x] Mark completed

### Task 4: Browser Agent Fallback — For Services Without MCP

**Goal:** Build the fallback system that creates accounts at services that don't have MCP servers. Uses Browser Use (open source) to automate the signup, with the user's connected email MCP for verification handling.

**Architectural context:**

This fallback ONLY runs when:
- A service does NOT have an MCP server (checked against the registry)
- AND the user has approved the account creation in the connect dialog

The typical flow:
1. User approves signup for a non-MCP service (e.g., RunPod)
2. KripTik's server-side agent launches a Browser Use session
3. Agent navigates to the service's signup page
4. Agent fills in: user's name, user's email, generates a secure password (stored in KripTik's vault)
5. Agent submits the form
6. **Email verification:** If the user has Gmail/email MCP connected, KripTik uses it to fetch the verification email, extract the link/code, and the agent completes verification autotically. If email MCP is NOT connected, KripTik sends a message in the chat: "Check your email for a verification code from RunPod and paste it here." User pastes, agent enters it.
7. **SMS verification:** Always asks the user to paste the code in chat — there's no clean way to intercept SMS.
8. Agent extracts API keys or credentials from the service's dashboard after signup
9. Credentials stored in KripTik's encrypted vault

**Cost:** ~$0.08-0.10 per signup using Browser Use's own model at $0.006/step. A signup is ~10-15 steps. For a user with 2-3 non-MCP services, total cost is under $0.30.

**What to build:**
- A server-side service that manages Browser Use sessions
- Workflow template system: each non-MCP service gets a template defining signup URL, form field mapping, verification type, and post-signup credential extraction
- Templates for at least: fal.ai, Replicate, RunPod, Render, Railway, Fly.io
- The chat-based approval and progress UI — user sees what the agent is doing in real time
- The "payour code" interaction for email/SMS verification when auto-verification isn't available
- Integration with Gmail MCP for automatic email verification

**Key decisions:**
- Browser Use runs server-side, not in the user's browser
- Passwords are generated randomly and stored encrypted — the user can view/change them in the dependency dashboard
- If a signup fails, show the error and offer to retry or let the user create the account manually
- The fallback is designed to be a last resort — as MCP adoption grows, fewer services need it

- [x] Set up Browser Use integration (server-side)
- [x] Build the workflow template system and data structure
- [x] Create templates for 6+ non-MCP services with real signup URLs and form field mappings
- [x] Build the chat-based approval and progress UI
- [x] Implement email verification via Gmail MCP integration
- [x] Implement the "paste your code" flow for SMS and non-MCP email verification
- [x] Implement secure credential generation and encrypted storage
- [x] Handle failures gracefully with retry and manual fallback options
- [x] Verify build passes
- [x] Update CLAUDE.md
- [x] Mark completed

### Task 5: Email MCP Banner and Popout Menu Integration

**Goal:** Add the "Dependencies" entry to the popout menu and create a dashboard banner prompting users to connect their email for automatic verification.

**Architectural context:**

The popout menu in KripTik has different contents depending on context, but "Dependencies" should appear in ALL variants. It navigates to the dependency management view.

The email banner appears on the main dashboard and says something like: "Connect your email to let KripTik automatically set up new service accounts for you." with a Connect button. When clicked, it initiates the MCP OAuth flow for Gmail (or Outlook, detected from the user's signup email domain). This is a one-time setup. The banner is dismissible and remembers dismissal state.

This is important because without email MCP, the browser agent fallback has to pause and ask the user to paste verification codes. With it connected, verification is fully automated.

- [x] Add "Dependencies" to the popout menu in ALL menu variants
- [x] Route it to the dependency management view
- [x] Build the email MCP connection banner — warm, non-intrusive, matches KripTik's design language
- [x] Banner has one-click Connect that initiates OAuth for Gmail/Outlook
- [x] Banner is dismissible with state persistence per user
- [x] Banner only shows if email MCP is not connected AND user has at least one project
- [x] Style per Design_References.md
- [x] Verify build passes
- [x] Update CLAUDE.md
- [x] Mark completed

### Task 6: Dependency Management View — Main Layout and Catalog

**Goal:** Build the primary dependency management view that users see when they click "Dependencies" in the popout menu. This is both a dashboard of connected services and a catalog to discover/add new ones.

**Architectural context:**

The view has two modes toggled at the top:
- **My Dependencies** — shows only servic user is connected to, with status and project associations
- **Browse All** — the full catalog of available services for discovery and connecting

**My Dependencies mode:**
- Search bar at top — filters connected services by name as user types
- Category filter tabs below search
- Grid of dependency tiles for connected services
- Each tile shows: large branded colored logo, service name, connection status (green dot = healthy, yellow = needs attention, red = disconnected), project badges (small pills showing which KripTik projects use this dependency), current subscription tier, quick-action menu (manage, disconnect, open service dashboard)
- Clicking a tile opens that dependency's management dashboard (Task 7)

**Browse All mode:**
- Same search and category filters
- Grid of ALL services from the registry
- Connected services show "Connected ✓" state
- Unconnected services show "Connect" button
- Each tile: branded logo, name, category, short description, pricing summary ("Free tier available" or "X/mo"), Connect button
- Featured/recommended section at top based on user's current project types

**View toggle:**
- A project selector dropdown that switches between "All Projects" and a specific project
- When a specific project is selected, My Dependencies filters to only show dependencies used by that project
- The project selector should show project names with small visual identifiers

**Layout:** Responsive grid — 4 columns wide desktop, 3 narrow desktop, 2 tablet, 1 mobile. Tiles must have visible depth with shadows, subtle gradients, hover elevation. The whole page should feel like a polished app store, not a flat admin panel.

- [x] Build the main dependency management page with routing
- [x] Build the My Dependencies / Browse All mode toggle
- [x] Build the search bar with real-time filtering
- [x] Build the category filter tabs
- [x] Build the dependency tile component with branded logos, status indicators, project badges
- [x] Build the project selector dropdown for filtering
- [x] Build the Browse All catalog view with Connect buttons
- [x] Populate with real data from the service registry (Task 2)
- [x] Make the grid fully responsive across all breakpoints
- [x] Style everything per Design_References.md — depth, warmth, smooth interactions
- [x] Verify build passes
- [x] Update CLAUDE.md
- [x] Mark completed

### Task 7: Individual Dependency Dashboard

**Goal:** When a user clicks on a connected dependency tile, they see a full management dashboard for that specific service. This is where they manage subscriptions, API keys, billing, project instances, and settings.

**Architectural context:**

The dashboard is a detail view (slide-over panel, modal, or new page — match the existing KripTik navigation pattern). It has sections:

**Header:** Large branded logo + service name, connection status, "Open [Service] Dashboard" external link, disconnect button

**Overview panel:** Current subscription tier with price, usage summary pulled from the service via MCP tools (API calls this month, sto used, bandwidth — whatever the service exposes), next billing date if applicable

**Project Instances panel:** A card for each KripTik project that uses this dependency. Each card shows: project name, the instance/project ID at the service (e.g., the Supabase project ref), environment (dev/staging/prod), API keys for this project-instance (masked by default with a reveal toggle and copy button), creation date. For "api-key-per-project" services, this shows separate API keys. For "project-per-project" services, this shows separate project instances.

**Subscription panel:** Current plan highlighted, all available plans shown with pricing side by side, "Change Plan" button. When changing plan: if the service has MCP tools for plan management, use them. If not, open the service's billing page in a new tab.

**API Keys panel:** All API keys for this service, across all projects. Create new key, revoke key, copy key. These actions execute via MCP tools where available.

**Billing panel:** Recent charges/invois if the service exposes billing data via MCP. Otherwise, link to the service's billing page.

**The dashboard adapts to what's available via MCP.** If a service's MCP server exposes billing tools, show billing inline. If it only exposes database tools, only show database management. Use `tools/list` results to determine what panels to render. For anything not available via MCP, show a "Manage on [Service]" link.

- [ ] Build the dependency dashboard container/layout
- [ ] Build the header with branded logo, status, and actions
- [ ] Build the overview panel that pulls data via MCP tools
- [ ] Build the project instances panel with per-project cards
- [ ] Build the subscription management panel with plan comparison
- [ ] Build the API keys panel with create/revoke/copy actions
- [ ] Build the billing panel (MCP data or external link fallback)
- [ ] Make panels render conditionally based on what MCP tools the service exposes
- [ ] Style every panel with depth, the service's brand color as accent, proper spacing
- [ ] Verify build passes
- [ ] Update CLAUDE.md
- [ ] Mark completed

### Task 8: Per-Project Dependency Management

**Goal:** Build the project-specific dependency view that shows and manages all dependencies for a single KripTik project. Also handle the logic for creating new instances/keys when a dependency is added to a project.

**Architectural context:**

This view is accessible from:
- The dependency management view when a specific project is selected in the dropdown
- The project's own dashboard/settings area
- Directly from the agent's chat when it says "I've added Supabase to your project"

**Instance creation logic when adding a dependency to a project:**
Different services need different things:
- **Supabase, Neon, PlanetScale** (databases): Create a new project/database at the service for this KripTik project, unless user specifies they want to reuse an existing one
- **Vercel, Cloudflare, Netlify** (hosting): Create a new project at the service
- **fal.ai, Replicate, OpenAI, Anthropic** (AI/ML APIs): Same account, generate a new API key labeled with the KripTik project name for billing visibility
- **Stripe** (payments): Create new API keys but same account
- **Sentry, LogRocket** (monitoring): Create a new project within the existing account
- **Clerk, Auth0** (auth): Create a new application within the existing account

This logic comes from the `instanceModel` field in the service registry (Task 2).

**"Add Dependency" flow from the project view:**
User clicks "Add Dependency" → mini catalog opens (filtered, can search) → user clicks Connect on a service → connect flow runs (Task 3) → after connection, the appropriate instance/key is created for this project → project view updates to show the new dependency

**"Remove from Project" flow:**
Removes the association between the KripTik project and the dependency instance. Does NOT delete the account or the instance at the service. Shows a confirmation: "This will remove [Service] from [Project]. Your [Service] account and data wileleted."

- [ ] Build the project dependency view showing all dependencies for one project
- [ ] Implement the "Add Dependency" flow with mini catalog
- [ ] Implement per-service instance creation logic based on instanceModel
- [ ] Implement "Remove from Project" with confirmation
- [ ] Wire into project dashboard/settings so it's accessible from the project context
- [ ] Show per-instance details: instance ID, API keys, environment, status
- [ ] Style per Design_References.md
- [ ] Verify build passes
- [ ] Update CLAUDE.md
- [ ] Mark completed

### Task 9: State Management, API Routes, and Full Wiring

**Goal:** Wire everything together — connect the MCP client, registry, connect flows, and UI into KripTik's existing state management and routing. Make sure the planning tile connect buttons work end-to-end.

**Architectural context:**

This task is about integration, not new features. It connects all the pieces:

- Global state for dependency connections (user's connected services, token validity, tool ches)
- API routes for: listing connected services, initiating MCP auth flows, storing tokens, managing project-dependency associations, proxying MCP tool calls to services, browser agent fallback triggers
- Planning tile integration: when the agent creates a planning tile with a dependency, the "Connect" button must use the connect flow from Task 3
- Connection health: periodic background checks that tokens are still valid — if a token expires and can't be refreshed, update the status to "needs attention"
- The dependency management view must load real data from connected services, not mock data

**Key wiring points:**
- The popout menu "Dependencies" button → dependency management view (Task 5 created the button, this wires the route)
- Planning tile "Connect" button → ConnectButton component (Task 3) with the correct service pre-selected
- Dependency tile click → individual dashboard (Task 7)
- Project dependency "Add" → connect flow (Task 3) → instance creation (Task 8)
- Post-connect: cache ols from `tools/list` so the agent knows what it can do with each service

- [ ] Set up global state management for dependency connections
- [ ] Create API routes for all dependency operations
- [ ] Wire planning tiles to use the ConnectButton component
- [ ] Wire the dependency management view to load real connected service data
- [ ] Implement connection health checking
- [ ] Wire project creation to trigger appropriate dependency instance creation
- [ ] Test the full flow: click Connect on planning tile → auth → connected → tools discovered
- [ ] Verify build passes
- [ ] Update CLAUDE.md
- [ ] Mark completed

### Task 10: Verification, Polish, and Production Readiness

**Goal:** Audit everything built in Tasks 1-9. Remove all stubs and placeholders. Verify logic. Optimize performance. Ensure production readiness for viral traffic.

**Verification checklist:**
- Scan every new file for placeholder text, TODO comments, stub functions, "lorem ipsum", "coming soon", hardcoded mock data, or console.logments — remove ALL of them
- Walk through each user flow mentally and verify it's logical:
  - Flow 1: New user → opens project → agent suggests Supabase → user clicks Connect → OAuth flow → account created → project instance created → agent can now create tables
  - Flow 2: User opens Dependencies → browses catalog → connects Stripe → goes back to project → Stripe appears in project dependencies
  - Flow 3: User clicks dependency tile → sees dashboard → changes subscription tier → tier updates
  - Flow 4: Non-MCP service → user approves → browser agent runs → email verification auto-handled → account created
- Verify all branded logos/icons render as real colored SVGs — no broken images, no gray boxes, no generic icons
- Check all dependency tiles render with correct brand colors
- Performance: check bundle size, lazy load the dependency management view, ensure initial page load is fast
- Mobile: test at 375px width — everything must be usable, not just "visible"
-ust be keyboard navigable, color contrast must meet WCAG AA

- [ ] Scan and remove ALL placeholders, stubs, TODOs, console.logs
- [ ] Walk through all user flows and verify logical correctness
- [ ] Verify all branded logos render correctly
- [ ] Check bundle size and implement lazy loading where needed
- [ ] Test responsive layout at all breakpoints (375, 390, 768, 1024, 1440, 1920)
- [ ] Verify keyboard accessibility
- [ ] Run `npm run build` — zero errors, zero warnings
- [ ] Run `npm run lint` — clean
- [ ] Run `npm run type-check` — clean
- [ ] Update CLAUDE.md with final state
- [ ] Mark completed

### Task 11: Documentation and Merge

**Goal:** Document what was built, update project documentation, then merge to main and verify the Vercel deployment.

- [ ] Update CLAUDE.md with complete documentation of the dependency management system
- [ ] Create or update an architecture doc explaining: how the MCP client works, how to add new services to the registry, how the browser fallback works, how tore stored
- [ ] Update any existing integration maps or architecture diagrams in the repo
- [ ] Verify the app builds cleanly one final time
- [ ] Verify the app starts locally without crashing
- [ ] Verify navigating to the dependency management view works
- [ ] Commit with a clear message describing the full feature
- [ ] Merge to main branch
- [ ] Monitor the Vercel auto-deployment for errors in the build log
- [ ] Verify the deployed URL loads correctly
- [ ] Mark completed
