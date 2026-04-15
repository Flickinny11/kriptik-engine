/**
 * prism-graph.ts — Knowledge graph schema for Prism engine.
 *
 * The graph IS the application. It persists through runtime,
 * editing, and optimization. It is never compiled to a different format.
 */

export interface PrismGraph {
  id: string;
  planId: string;
  projectId: string;
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hubs: Hub[];
  metadata: GraphMetadata;
}

export interface GraphNode {
  id: string;
  type: 'element' | 'service' | 'integration' | 'data-model';
  elementType?: UIElementType;
  caption: string;
  captionVerified: boolean;
  hubMemberships: string[];
  position: { x: number; y: number; z: number; width: number; height: number };
  visualSpec: NodeVisualSpec;
  behaviorSpec: NodeBehaviorSpec;
  code: string | null;
  codeHash: string | null;
  verificationScore: number | null;
  imageUrl: string | null;
  atlasRegion: AtlasRegion | null;
  dependencies: string[];
  status: 'pending' | 'image_ready' | 'caption_verified' | 'code_generated' | 'verified' | 'failed';
}

export type UIElementType =
  | 'page-background' | 'navbar' | 'sidebar' | 'footer'
  | 'hero-section' | 'card' | 'button' | 'input' | 'textarea'
  | 'select' | 'checkbox' | 'radio' | 'toggle' | 'slider'
  | 'image' | 'icon' | 'avatar' | 'badge' | 'tag'
  | 'table' | 'list' | 'grid' | 'carousel' | 'tabs'
  | 'modal' | 'drawer' | 'popover' | 'tooltip'
  | 'progress' | 'spinner' | 'skeleton'
  | 'chart' | 'graph' | 'map'
  | 'video-player' | 'audio-player'
  | 'form' | 'search-bar' | 'breadcrumb' | 'pagination'
  | 'notification' | 'toast' | 'alert'
  | 'custom';

export interface NodeVisualSpec {
  description: string;
  colors: { primary: string; secondary?: string; accent?: string; text?: string };
  typography: { fontFamily?: string; fontSize?: number; fontWeight?: number };
  spacing: { padding?: string; margin?: string; gap?: string };
  borders: { radius?: string; width?: string; color?: string; style?: string };
  effects: { shadow?: string; blur?: string; opacity?: number; glow?: string };
  animation: AnimationSpec | null;
  textContent: TextContentSpec[];
}

export interface TextContentSpec {
  text: string;
  role: 'heading' | 'body' | 'label' | 'placeholder' | 'caption';
  renderMethod: 'sharp-svg' | 'msdf' | 'diffusion';
  typography: { fontFamily: string; fontSize: number; fontWeight: number; color: string };
  position: { x: number; y: number; anchor: 'left' | 'center' | 'right' };
}

export interface AnimationSpec {
  trigger: 'load' | 'hover' | 'click' | 'scroll' | 'focus';
  type: 'fade' | 'slide' | 'scale' | 'rotate' | 'bounce' | 'glow' | 'custom';
  duration: number;
  easing: string;
  customCode?: string;
}

export interface NodeBehaviorSpec {
  interactions: Interaction[];
  dataBindings: DataBinding[];
  stateManagement: StateSpec | null;
  apiCalls: APICallSpec[];
  accessibilityRole: string;
  tabIndex: number;
}

export interface Interaction {
  event: 'click' | 'hover' | 'focus' | 'submit' | 'change' | 'scroll' | 'keydown';
  action: 'navigate' | 'toggle' | 'submit' | 'open-modal' | 'close-modal'
    | 'api-call' | 'state-update' | 'animation' | 'custom';
  targetNodeId?: string;
  targetHubId?: string;
  payload?: Record<string, unknown>;
  customCode?: string;
}

export interface DataBinding {
  source: 'state' | 'api' | 'props' | 'computed';
  path: string;
  transform?: string;
  defaultValue?: unknown;
}

export interface StateSpec {
  key: string;
  type: string;
  initialValue: unknown;
  scope: 'local' | 'hub' | 'global';
  persistence: 'none' | 'session' | 'local-storage';
}

export interface APICallSpec {
  endpointPath: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  errorHandling: 'toast' | 'inline' | 'redirect' | 'silent';
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'contains' | 'navigates-to' | 'triggers' | 'data-flow'
    | 'shares-state' | 'depends-on' | 'renders';
  metadata: Record<string, unknown>;
}

export interface Hub {
  id: string;
  name: string;
  route: string;
  layoutTemplate: 'single-column' | 'two-column' | 'sidebar' | 'dashboard' | 'fullscreen';
  nodeIds: string[];
  sharedNodeIds: string[];
  authRequired: boolean;
  transitions: HubTransition[];
  metadata: Record<string, unknown>;
}

export interface HubTransition {
  targetHubId: string;
  trigger: 'navigation' | 'redirect' | 'modal-open';
  animation: 'fade' | 'slide-left' | 'slide-right' | 'none';
}

export interface AtlasRegion {
  atlasIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  totalHubs: number;
  totalSharedNodes: number;
  estimatedDrawCalls: number;
  atlasCount: number;
  totalCodeSize: number;
  generationTimeMs: number;
  totalCost: number;
}
