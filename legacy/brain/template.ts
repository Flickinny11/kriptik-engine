/**
 * Template brain seeding — foundational knowledge nodes that give agents
 * design constraints, quality standards, and anti-slop rules to reference.
 *
 * This is KNOWLEDGE, not instructions. Agents query these constraints
 * when they need design/quality guidance. They don't get told what to do.
 *
 * Called once in initEngine() after brain creation, before agent launch.
 * Idempotent — skips if template constraints already exist.
 */

import type { BrainService } from './brain-service.js';

interface ConstraintDef {
  title: string;
  rule: string;
  rationale: string;
  examples: string[];
  category: 'anti-slop' | 'design-system' | 'quality-floor';
}

const TEMPLATE_CONSTRAINTS: ConstraintDef[] = [
  // --- Anti-slop constraints ---
  {
    title: 'No icon libraries as design elements',
    rule: 'Do not use lucide-react, heroicons, or font-awesome icons as primary visual/design elements (hero illustrations, feature icons, decorative elements). They are fine for small UI affordances like chevrons in dropdowns or close buttons.',
    rationale: 'Icon library defaults are the #1 tell of AI-generated UIs. Every AI builder outputs the same lucide-react icon soup. Premium apps use custom SVGs, illustrations, or no icons at all.',
    examples: ['Hero section with 6 lucide-react icons in a grid', 'Feature cards where the icon IS the visual', 'Decorative icons scattered around headings'],
    category: 'anti-slop',
  },
  {
    title: 'No emoji as UI elements',
    rule: 'Do not use emoji as section markers, feature icons, button labels, or decorative elements in the UI.',
    rationale: 'Emoji in UI screams "quick prototype." Professional apps use typography, color, and layout for visual communication.',
    examples: ['🚀 Get Started button', '✨ Features section header', 'Emoji bullets in feature lists'],
    category: 'anti-slop',
  },
  {
    title: 'No generic gradient backgrounds',
    rule: 'Do not use purple/blue/indigo gradient backgrounds, especially on hero sections. If gradients are used, they must be subtle, on-brand, and not the default Tailwind gradient utilities.',
    rationale: 'Purple-blue gradients are the universal AI builder aesthetic. They signal "this was auto-generated." Use solid colors, textured backgrounds, or brand-specific gradients.',
    examples: ['bg-gradient-to-r from-purple-600 to-blue-600', 'Hero with a generic radial gradient', 'Card backgrounds with indigo gradients'],
    category: 'anti-slop',
  },
  {
    title: 'No placeholder images or stock photo markers',
    rule: 'No "Your Image Here" placeholders, no via.placeholder.com URLs, no unsplash random image URLs used as permanent content. Every image should be intentional or use a proper empty state.',
    rationale: 'Placeholder images that ship to users destroy credibility. Either use real images, generate appropriate ones, or design proper empty states.',
    examples: ['<img src="https://via.placeholder.com/300">', 'Alt text saying "placeholder"', 'Stock photo with watermark'],
    category: 'anti-slop',
  },
  {
    title: 'No Lorem Ipsum anywhere',
    rule: 'No Lorem Ipsum, "Lorem", or any latin filler text. Every piece of text must be real, contextual content relevant to the app.',
    rationale: 'Lorem Ipsum in a shipped product means the builder didn\'t finish. Real content communicates value; filler communicates negligence.',
    examples: ['Lorem ipsum dolor sit amet...', 'Descriptive text coming soon', 'Paragraph with lorem-style text'],
    category: 'anti-slop',
  },
  {
    title: 'No Coming Soon sections',
    rule: 'Do not create "Coming Soon" sections, disabled features, or empty pages with future promises. If a feature is not built, it should not appear in the UI.',
    rationale: 'Coming Soon sections tell users the app is incomplete. Either build it or don\'t show it.',
    examples: ['"Coming Soon" badge on a nav item', 'Grayed out feature card', 'Empty page with "Under Construction"'],
    category: 'anti-slop',
  },
  {
    title: 'No identical card layouts across pages',
    rule: 'Each page should have distinct layout patterns. Do not copy the same card grid pattern across dashboard, gallery, settings, and every other page.',
    rationale: 'Repetitive card grids make apps feel template-generated. Different content types deserve different presentation patterns — tables, masonry, lists, feature panels.',
    examples: ['Every page is a 3-column card grid', 'Dashboard and settings using identical card layouts', 'Gallery and user list looking the same'],
    category: 'anti-slop',
  },
  {
    title: 'No generic welcome hero copy',
    rule: 'Opening content should communicate a specific value proposition, not "Welcome to [App Name]" with generic subtitle text.',
    rationale: 'Generic welcome messages waste the most valuable real estate in the app. The hero should immediately tell users what they can do and why they should care.',
    examples: ['"Welcome to MyApp" with "Get started today"', '"The best way to manage your..." boilerplate', 'Hero with just a logo and "Sign Up"'],
    category: 'anti-slop',
  },
  {
    title: 'No default Tailwind color palette',
    rule: 'Define a custom color system. Do not ship with Tailwind\'s default blue-500, gray-100, etc. as the primary visual language.',
    rationale: 'Default Tailwind colors are recognizable to anyone who\'s seen a Tailwind site. Custom colors create brand identity.',
    examples: ['Primary buttons using bg-blue-500', 'Backgrounds using default gray scale', 'Accents using default indigo/purple'],
    category: 'anti-slop',
  },
  {
    title: 'No generic loading spinners',
    rule: 'Loading states should be skeleton screens or contextual progress indicators, not generic circular spinners.',
    rationale: 'Skeleton screens feel faster (perceived performance) and maintain layout stability. Generic spinners are lazy and disorienting.',
    examples: ['<Spinner /> on a white page', 'Circular loading indicator centered on screen', 'Loading... text with no visual context'],
    category: 'anti-slop',
  },
  {
    title: 'No hardcoded test data in production',
    rule: 'No "admin@example.com", "John Doe", "Test User", "123 Main St" or similar obviously fake data in seed data or defaults.',
    rationale: 'Test data that leaks to production looks broken. Use realistic but clearly fictional data, or better, start with proper empty states.',
    examples: ['Default user "John Doe"', 'admin@example.com in login form', '"123 Main Street" in address fields'],
    category: 'anti-slop',
  },
  {
    title: 'No alert() or window.confirm()',
    rule: 'Do not use browser alert(), confirm(), or prompt() for user interactions. Use proper modal/toast components.',
    rationale: 'Browser dialogs are ugly, unthemeable, and block the main thread. They break the app\'s visual identity.',
    examples: ['alert("Success!")', 'if(confirm("Delete?"))', 'window.prompt("Enter name")'],
    category: 'anti-slop',
  },
  {
    title: 'No raw console.log in production code',
    rule: 'Remove all console.log statements from production code. Use proper logging if needed.',
    rationale: 'Console.log in production leaks internal state, clutters the browser console, and signals unfinished code.',
    examples: ['console.log("data:", data)', 'console.log("here")', 'Debugging logs left in event handlers'],
    category: 'anti-slop',
  },
  {
    title: 'No inline styles duplicating utilities',
    rule: 'Do not use inline style attributes when the same effect is available via the project\'s CSS framework/utilities.',
    rationale: 'Inline styles are harder to maintain, can\'t be responsive, and bypass the design system.',
    examples: ['style={{marginTop: "20px"}} when mt-5 exists', 'style={{color: "red"}} instead of text-red-500', 'style={{display: "flex"}} instead of flex class'],
    category: 'anti-slop',
  },
  {
    title: 'No CDN-linked icon/font libraries',
    rule: 'Do not link font-awesome, Google Icons, or other libraries via CDN <link> tags. Bundle properly or use SVGs.',
    rationale: 'CDN links add external dependencies, increase load time, and can break if the CDN is down.',
    examples: ['<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/...">', 'Script tag for icon library CDN'],
    category: 'anti-slop',
  },

  // --- Design system defaults ---
  {
    title: 'Typography hierarchy required',
    rule: 'Typography must have clear hierarchy: distinct sizes and weights for h1, h2, h3, h4, body text, small/caption, and overline text. Define these in the project\'s global styles or Tailwind config.',
    rationale: 'Typography hierarchy creates visual order and guides reading. Without it, pages feel flat and unstructured.',
    examples: ['All headings the same size', 'No distinction between h1 and h2', 'Body text same size as captions'],
    category: 'design-system',
  },
  {
    title: 'Complete color system required',
    rule: 'Define a color system with: primary, secondary, accent, background, surface (card/panel bg), and semantic colors (success green, warning amber, error red, info blue). Include both light and dark values.',
    rationale: 'A complete color system ensures visual consistency. Missing semantic colors lead to ad-hoc color choices that clash.',
    examples: ['Only primary color defined', 'Error states using random red', 'No surface color distinction from background'],
    category: 'design-system',
  },
  {
    title: 'Consistent spacing scale',
    rule: 'Use a consistent spacing scale based on 4px or 8px increments. Don\'t mix arbitrary pixel values.',
    rationale: 'Consistent spacing creates visual rhythm. Arbitrary values (13px here, 17px there) create subtle visual noise.',
    examples: ['padding: 13px', 'margin-top: 7px', 'gap: 11px'],
    category: 'design-system',
  },
  {
    title: 'Consistent border radius',
    rule: 'Border radius values should be consistent across component types. Buttons, cards, inputs, and modals should use a shared radius scale.',
    rationale: 'Mismatched border radii (rounded buttons with sharp cards) look unfinished.',
    examples: ['Buttons rounded-full but cards rounded-none', 'Inputs rounded-lg but modals rounded-sm'],
    category: 'design-system',
  },
  {
    title: 'Consistent transitions',
    rule: 'Interactive elements should use consistent transition duration (150-300ms) and easing (ease-out for enter, ease-in for exit). Define these as CSS custom properties or Tailwind config values.',
    rationale: 'Inconsistent animation timing makes the UI feel janky. Some elements snapping while others glide is worse than no animation at all.',
    examples: ['Button with 500ms transition next to instant-appearing dropdown', 'Different easing on every component'],
    category: 'design-system',
  },

  // --- Quality floor ---
  {
    title: 'Form inputs require labels and validation',
    rule: 'All form inputs must have visible labels (not just placeholders), validation states (error, success), and clear error messages.',
    rationale: 'Placeholder-only labels disappear when typing (accessibility fail). Missing validation leaves users confused about what went wrong.',
    examples: ['Input with only placeholder="Email"', 'Form submits with no validation feedback', 'Error shown as console.log'],
    category: 'quality-floor',
  },
  {
    title: 'All async operations need loading, error, and empty states',
    rule: 'Every API call, data fetch, or async operation must handle three states: loading (skeleton/spinner), error (meaningful message + retry), and empty (helpful message + call to action).',
    rationale: 'Missing states means users see blank screens, cryptic errors, or nothing at all. Each state is a design opportunity.',
    examples: ['Page shows nothing while data loads', 'API error shows raw JSON', 'Empty list shows blank space'],
    category: 'quality-floor',
  },
  {
    title: 'All images require alt text',
    rule: 'Every <img> tag must have meaningful alt text. Decorative images should have alt="".',
    rationale: 'Screen readers need alt text. Missing alt text is a WCAG failure and poor UX for visually impaired users.',
    examples: ['<img src="..." /> with no alt', 'alt="image" on every image', 'alt="undefined" from missing data'],
    category: 'quality-floor',
  },
  {
    title: 'Interactive elements must be keyboard accessible',
    rule: 'All clickable elements must be focusable and activatable via keyboard (Enter/Space). Custom components must implement proper ARIA roles.',
    rationale: 'Keyboard accessibility is a baseline requirement. Many users navigate with keyboards, and it\'s legally required in many jurisdictions.',
    examples: ['onClick on a <div> with no tabIndex', 'Custom dropdown with no keyboard support', 'Modal that can\'t be closed with Escape'],
    category: 'quality-floor',
  },
  {
    title: 'Consistent navigation across pages',
    rule: 'Navigation (header, sidebar, footer) must be consistent on every page. Active state should indicate current page.',
    rationale: 'Inconsistent navigation confuses users. It signals the app was assembled, not designed.',
    examples: ['Nav disappears on some pages', 'Different header layout on settings vs dashboard', 'No active state on nav links'],
    category: 'quality-floor',
  },
  {
    title: 'Mobile responsiveness mandatory',
    rule: 'All pages must be usable on mobile devices (320px width minimum) unless explicitly scoped as desktop-only.',
    rationale: 'Over 50% of web traffic is mobile. A non-responsive app is a broken app for half its users.',
    examples: ['Horizontal scroll on mobile', 'Text too small to read', 'Buttons too close together for touch'],
    category: 'quality-floor',
  },
  {
    title: 'API errors shown meaningfully',
    rule: 'API errors must be caught and displayed to users as helpful messages, not raw error dumps or silent failures.',
    rationale: 'Users need to know what went wrong and what they can do about it. "Something went wrong, try again" beats a 500 stack trace.',
    examples: ['Unhandled promise rejection', 'Raw error.message shown to user', 'Silent failure — nothing happens on click'],
    category: 'quality-floor',
  },
  {
    title: 'Auth flows must be complete',
    rule: 'If the app has authentication, it must handle: login, signup, logout, session expiry, and password reset gracefully. Protected routes must redirect to login.',
    rationale: 'Incomplete auth flows are the most common "it looks done but doesn\'t work" failure. Users who can\'t log in can\'t use the app.',
    examples: ['No logout button', 'Session expires with no redirect', 'Password reset not implemented', 'Protected page accessible without login'],
    category: 'quality-floor',
  },
];

export async function seedTemplateBrain(
  brain: BrainService,
  projectId: string,
): Promise<{ seeded: boolean; nodesCreated: number }> {
  // Idempotency check — skip if template constraints already exist
  const existing = brain.getNodesByType(projectId, 'constraint').filter(
    (n) => n.createdBy === 'template',
  );
  if (existing.length > 0) {
    console.log(`Template brain: ${existing.length} constraint nodes already exist for project ${projectId}, skipping`);
    return { seeded: false, nodesCreated: 0 };
  }

  const createdIds: string[] = [];

  for (const def of TEMPLATE_CONSTRAINTS) {
    const node = await brain.writeNode(
      projectId,
      'constraint',
      def.title,
      {
        rule: def.rule,
        rationale: def.rationale,
        examples: def.examples,
        category: def.category,
        source: 'template',
      },
      'template',
      { confidence: 1.0 },
    );
    createdIds.push(node.id);
  }

  // Add relates_to edges between constraints in the same category
  const byCategory = new Map<string, string[]>();
  for (let i = 0; i < TEMPLATE_CONSTRAINTS.length; i++) {
    const cat = TEMPLATE_CONSTRAINTS[i].category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(createdIds[i]);
  }

  for (const [, ids] of byCategory) {
    // Link first node to all others in same category (star topology, not full mesh)
    if (ids.length > 1) {
      for (let i = 1; i < ids.length; i++) {
        await brain.addEdge(projectId, ids[0], ids[i], 'relates_to', 'template');
      }
    }
  }

  console.log(`Template brain: seeded ${createdIds.length} constraint nodes for project ${projectId}`);
  return { seeded: true, nodesCreated: createdIds.length };
}
