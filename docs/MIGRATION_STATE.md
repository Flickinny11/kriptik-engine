# UI Migration State — KripTik Old App → New Engine App

## Last Updated: 2026-03-21

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Foundation | ✅ COMPLETE | CSS, Glass, Premium UI migrated |
| Phase 1: Dashboard | ✅ COMPLETE | Liquid glass UI, HoverSidebar, project cards, delete modal |
| Phase 2: Builder | ✅ COMPLETE | FixMyApp cards recreated (engine-wired), 11 builder components, 6 stores |
| Phase 3: Dev Toolbar + OSS + Feature Agents | ✅ COMPLETE | 17 dev-bar, 11 feature-agent, 40 OSS files + stores/hooks |
| Phase 4: Fix My App + Import | ✅ COMPLETE | 11 fix-my-app, 6 import components |
| Phase 5: Deployment, Collaboration, Credentials | ✅ COMPLETE | 13 deployment, 4 collaboration, 4 credentials |
| Phase 6: Layouts, Services, Data, Stores, Hooks | ✅ COMPLETE | 5 layouts, 9 lib utils, 5 animations, 2 integrations, 2 services, 3 data, 14 stores, 6 hooks |
| Phase 7: Final Audit | ✅ COMPLETE | All scans pass, zero violations, build clean |

## Phase 0 Details — COMPLETE

### Task 0.1: Design System CSS and Fonts ✅
- Added DM Sans, Space Grotesk fonts to index.css
- Copied `styles/design-system.css` (785 LOC) — hex color scales, fluid typography, shadows, glow, atmospheric backgrounds, glass panels, button system, input system, toast system, code blocks
- Copied `styles/realistic-glass.css` (1,111 LOC) — photorealistic glass button effects, warm glow states, shine animations
- Copied `styles/view-transitions.css` (182 LOC) — View Transitions API with panel/chat/preview transitions
- Removed duplicate font import from design-system.css

### Task 0.2: Glass Component Library ✅
- Copied 11 glass components to `client/src/components/ui/glass/`:
  - GlassCard, GlassPanel, GlassButton, GlassInput, GlassTextarea, GlassSelect, GlassToggle, GlassBadge, GlassModal, ThreeGlassModal, index.ts
- Copied `lib/webgl.ts` (139 LOC) — WebGL capability detection utility (required by ThreeGlassModal)
- All pure visual — zero mechanical patterns

### Task 0.3: Premium Buttons, 3D Cards, Icons ✅
- Copied `premium-buttons/Premium3DButtons.tsx` + CSS
- Copied: GlitchText.tsx + glitch.css, HandDrawnArrow.tsx, EmptyState.tsx (fixed icon import), AtmosphericBackground.tsx, InterlockingIcons3D.tsx, ProjectCard3DTile.tsx + CSS
- **SKIPPED** (mechanical patterns detected):
  - FixMyAppCard3D.tsx — contains hardcoded orchestrator imports, phase enums, fixing status state machine
  - FixMyAppFlipCard.tsx — contains 6 hardcoded sequential phases, phase progression logic, orchestrationPhase prop
  - These will be REWRITTEN clean in Phase 4

### Phase 0 Audit ✅
- All 7 mechanical scans PASS
- `CHECK_ALL=true bash scripts/check-mechanical.sh` → PASSED
- `cd client && npx vite build` → ✓ built in 3.46s
- Zero lucide-react, zero @icons-pack, zero mechanical identifiers

## Files Added (Phase 0)

```
client/src/styles/design-system.css        (785 LOC)
client/src/styles/realistic-glass.css      (1,111 LOC)
client/src/styles/view-transitions.css     (182 LOC)
client/src/lib/webgl.ts                    (139 LOC)
client/src/components/ui/glass/GlassCard.tsx       (202 LOC)
client/src/components/ui/glass/GlassPanel.tsx      (136 LOC)
client/src/components/ui/glass/GlassButton.tsx     (292 LOC)
client/src/components/ui/glass/GlassInput.tsx      (205 LOC)
client/src/components/ui/glass/GlassTextarea.tsx   (249 LOC)
client/src/components/ui/glass/GlassSelect.tsx     (399 LOC)
client/src/components/ui/glass/GlassToggle.tsx     (168 LOC)
client/src/components/ui/glass/GlassBadge.tsx      (148 LOC)
client/src/components/ui/glass/GlassModal.tsx      (305 LOC)
client/src/components/ui/glass/ThreeGlassModal.tsx (427 LOC)
client/src/components/ui/glass/index.ts            (60 LOC)
client/src/components/ui/premium-buttons/Premium3DButtons.tsx
client/src/components/ui/premium-buttons/Premium3DButtons.css
client/src/components/ui/GlitchText.tsx
client/src/components/ui/glitch.css
client/src/components/ui/HandDrawnArrow.tsx
client/src/components/ui/EmptyState.tsx
client/src/components/ui/AtmosphericBackground.tsx
client/src/components/ui/InterlockingIcons3D.tsx
client/src/components/ui/ProjectCard3DTile.tsx
client/src/components/ui/ProjectCard3DTile.css
```

## Files Modified (Phase 0)

```
client/src/index.css — Added font imports (DM Sans, Space Grotesk) + style imports
```

## Next Step

## Phase 1 Details — COMPLETE

### Task 1.1: Navigation (HoverSidebar + SidebarNav) ✅
- Copied 6 navigation components: HoverSidebar (401 LOC), SidebarNav (298 LOC), Breadcrumbs, StepNav, TabNav, index.ts
- Copied 2 hooks: useResponsiveLayout (219 LOC), useReducedMotion (125 LOC)
- Pre-scanned all files — zero mechanical patterns
- StepNav verified as purely visual (no sequential enforcement)

### Task 1.2: Dashboard Page + Core Components ✅
- **Rewrote Dashboard.tsx** (old: 1,835 LOC → new: ~680 LOC) with premium liquid glass design from old app
- Kept: AnimatedPlaceholder typewriter, CreditMeter, UserMenu (liquid glass badge + dropdown), HoverSidebar, glass header with glass thickness edge, GenerateButton3D, delete confirmation modal, manage mode with delete buttons
- **Stripped mechanical patterns**: useMultiProjectWebSocket, useBuildSessionStore, useOnboardingStore, ACTIVE_FIXING_STATUSES, fixingStatus tracking, capture progress polling, orchestrationPhase, HyperBrowser capture, all Fix My App orchestration
- Copied: DeleteConfirmModal (217 LOC), CardExplosion (595 LOC), NewProjectModal (354 LOC), BuildInterruptInput (248 LOC, rewired from /api/soft-interrupt to Brain directive)
- Deleted Dashboard.tsx.old reference file after migration

### Task 1.3: KriptikLogo, Icons, Templates ✅
- KriptikLogo already migrated (246 LOC, identical to old app)
- GlitchText + glitch.css already migrated in Phase 0
- HandDrawnArrow already migrated in Phase 0
- GenerateButton3D already present (305 LOC)

### Task 1.4: Dashboard Stores and Hooks ✅
- New Dashboard uses existing new app stores (useUserStore, useProjectStore) — already wired
- useCostStore deferred (credits shown from useUserStore.user.credits)
- useTemplateStore deferred (template gallery migration in later phase)

### Phase 1 Audit ✅
- All 10 scans PASSED
- Mechanical scanner: PASSED
- Zero mechanical identifiers in client/src/
- Zero deleted component references
- Zero forbidden library imports
- Zero hardcoded agent types
- Zero old orchestration endpoints
- Zero Fix My App mechanical patterns
- Build succeeds: ✓ built in 3.41s
- Engine src/: only CLAUDE.md documentation changed (no code)
- Builder SSE: 5 references to useEngineEvents/useAgentTracker/AgentStreamView (unchanged)

## Next Step

**Phase 2, Task 2.1**: Builder Layout Shell — extract layout from old Builder.tsx, merge with new Builder's SSE system, strip all phase tracking.

## Decisions Made

1. The new app's index.css already had OKLCH design tokens — these were kept as-is, the old app's hex-based tokens from design-system.css were added as supplements (not replacements)
2. FixMyAppCard3D and FixMyAppFlipCard were SKIPPED because they contain hardcoded phase pipelines — they'll be rewritten clean in Phase 4
3. EmptyState.tsx icon import was fixed to use the new app's icon type system
4. Dashboard was rewritten from new app's base (correct stores/API) enhanced with old app's visual design, rather than copying old app and stripping — this is the safest approach to avoid mechanical patterns leaking through
5. BuildInterruptInput's mechanical `/api/soft-interrupt/submit` endpoint replaced with Brain directive via `/api/projects/:id/directive`

## Files Added (Phase 0 + Phase 1)

```
# Phase 0
client/src/styles/design-system.css
client/src/styles/realistic-glass.css
client/src/styles/view-transitions.css
client/src/lib/webgl.ts
client/src/components/ui/glass/ (11 files)
client/src/components/ui/premium-buttons/ (2 files)
client/src/components/ui/GlitchText.tsx + glitch.css
client/src/components/ui/HandDrawnArrow.tsx
client/src/components/ui/EmptyState.tsx
client/src/components/ui/AtmosphericBackground.tsx
client/src/components/ui/InterlockingIcons3D.tsx
client/src/components/ui/ProjectCard3DTile.tsx + .css

# Phase 1
client/src/components/navigation/ (6 files)
client/src/hooks/useResponsiveLayout.ts
client/src/hooks/useReducedMotion.ts
client/src/components/dashboard/DeleteConfirmModal.tsx
client/src/components/dashboard/CardExplosion.tsx
client/src/components/dashboard/NewProjectModal.tsx
client/src/components/dashboard/BuildInterruptInput.tsx
```

## Files Modified (Phase 0 + Phase 1)

```
client/src/index.css — font imports + style imports
client/src/pages/Dashboard.tsx — rewritten with premium liquid glass design
```

## Engine Integrity

✅ **Engine `src/` was NOT modified** — only CLAUDE.md documentation touched
✅ **useEngineEvents, useAgentTracker, AgentStreamView** — UNCHANGED (5 references in Builder)
✅ **All agentic behavior remains Brain-driven** — no mechanical patterns introduced
✅ **All 10 audit scans pass** — zero violations
