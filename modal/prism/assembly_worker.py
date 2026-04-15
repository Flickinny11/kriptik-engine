"""PixiJS bundle assembly worker for Prism pipeline.

Assembles verified node code + graph + atlases into a deployable PixiJS v8 bundle.

INVARIANT 1: The graph IS the app -- graph.json persists as runtime representation.
             It is NOT compiled away. It is included in the bundle and loaded at runtime.

RED LINE 6: Per-node modules, NOT monolithic bundle. Each node gets its own
            {nodeId}.js file in nodes/. The graph-to-tree adapter loads them
            dynamically at runtime.

Bundle structure (from spec Section 13):
  bundle/
    index.html              -- Entry point
    app.js                  -- PixiJS v8 setup + initialization
    graph.json              -- Serialized knowledge graph (THE runtime representation)
    nodes/
      {nodeId}.js           -- Per-node code module (one file per node)
    atlases/
      atlas-0.png           -- Texture atlas images
    fonts/
      {font}.fnt            -- MSDF font atlas files
    shared/
      manager.js            -- Hub manager (navigation between hubs)
      adapter.js            -- Graph-to-tree adapter (bipartite DAG -> PixiJS single-parent)
      animations.js         -- Shared animation utilities (GSAP helpers)
      state.js              -- Application state management

Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 13 -- PixiJS Assembly & Rendering
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CDN URLs for runtime dependencies
# ---------------------------------------------------------------------------

# PixiJS v8 -- WebGPU-first renderer
_PIXI_CDN = "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"
# GSAP for animations
_GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"
_GSAP_PIXI_CDN = "https://cdn.jsdelivr.net/npm/gsap@3/dist/PixiPlugin.min.js"


# ---------------------------------------------------------------------------
# Bundle assembly
# ---------------------------------------------------------------------------


def assemble_bundle(
    graph: dict,
    atlas_data: dict,
    output_dir: str = "/outputs",
) -> dict:
    """Assemble the complete PixiJS bundle from a verified graph.

    Steps:
    1. Create bundle directory structure
    2. Write graph.json (the runtime representation -- Invariant 1)
    3. Write per-node code modules to nodes/{nodeId}.js
    4. Copy atlas images to atlases/
    5. Generate index.html (PixiJS loader)
    6. Generate app.js (PixiJS setup + graph-to-tree adapter)
    7. Generate shared/ utility modules
    8. Calculate bundle size

    Args:
        graph: Complete PrismGraph dict with verified node code.
        atlas_data: Dict mapping atlas index to PNG bytes.
                    Shape: { "atlases": [{ "index": int, "imageBytes": bytes }] }
        output_dir: Root output directory (Modal volume mount).

    Returns:
        {
            "bundlePath": str,
            "bundleSize": int,          # Total bytes
            "nodeCount": int,
            "atlasCount": int,
            "files": [str],             # All file paths in bundle
        }
    """
    start = time.monotonic()

    project_id = graph.get("projectId", "unknown")
    version = graph.get("version", 1)

    bundle_dir = Path(output_dir) / project_id / str(version) / "bundles" / "frontend"
    bundle_dir.mkdir(parents=True, exist_ok=True)

    all_files: list[str] = []
    nodes: list[dict] = graph.get("nodes", [])
    hubs: list[dict] = graph.get("hubs", [])
    atlases: list[dict] = atlas_data.get("atlases", []) if atlas_data else []

    # 1. Write graph.json -- INVARIANT 1: the graph IS the app
    graph_json_path = bundle_dir / "graph.json"
    # Strip imageBytes and other binary data from the serialized graph;
    # only the structural/behavioral data is needed at runtime.
    runtime_graph = _build_runtime_graph(graph)
    graph_json_path.write_text(json.dumps(runtime_graph, indent=2), encoding="utf-8")
    all_files.append(str(graph_json_path))
    logger.info("Wrote graph.json (%d bytes)", graph_json_path.stat().st_size)

    # 2. Write per-node code modules -- RED LINE 6: one file per node
    nodes_dir = bundle_dir / "nodes"
    nodes_dir.mkdir(parents=True, exist_ok=True)
    node_count = 0
    for node in nodes:
        node_id = node.get("id", "")
        code = node.get("code")
        if not node_id or not code:
            logger.warning(
                "Skipping node %s: missing id or code (status=%s)",
                node_id, node.get("status"),
            )
            continue
        node_path = nodes_dir / f"{node_id}.js"
        node_path.write_text(code, encoding="utf-8")
        all_files.append(str(node_path))
        node_count += 1

    logger.info("Wrote %d node modules to nodes/", node_count)

    # 3. Write atlas images to atlases/
    atlases_dir = bundle_dir / "atlases"
    atlases_dir.mkdir(parents=True, exist_ok=True)
    atlas_count = 0
    for atlas in atlases:
        idx = atlas.get("index", atlas_count)
        image_bytes = atlas.get("imageBytes", b"")
        if not image_bytes:
            continue
        atlas_path = atlases_dir / f"atlas-{idx}.png"
        atlas_path.write_bytes(image_bytes)
        all_files.append(str(atlas_path))
        atlas_count += 1

    logger.info("Wrote %d atlas image(s) to atlases/", atlas_count)

    # 4. Create fonts/ directory (MSDF font atlases are generated separately)
    fonts_dir = bundle_dir / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)

    # 5. Generate shared/ utility modules
    shared_dir = bundle_dir / "shared"
    shared_dir.mkdir(parents=True, exist_ok=True)

    shared_files = {
        "manager.js": generate_hub_manager_js(graph),
        "adapter.js": generate_adapter_js(),
        "animations.js": generate_animations_js(),
        "state.js": generate_state_js(),
    }
    for filename, content in shared_files.items():
        filepath = shared_dir / filename
        filepath.write_text(content, encoding="utf-8")
        all_files.append(str(filepath))

    logger.info("Wrote %d shared modules to shared/", len(shared_files))

    # 6. Generate app.js
    app_js_path = bundle_dir / "app.js"
    app_js_path.write_text(generate_app_js(graph), encoding="utf-8")
    all_files.append(str(app_js_path))

    # 7. Generate index.html
    index_html_path = bundle_dir / "index.html"
    index_html_path.write_text(generate_index_html(graph), encoding="utf-8")
    all_files.append(str(index_html_path))

    # 8. Calculate total bundle size
    total_size = 0
    for fpath in all_files:
        try:
            total_size += os.path.getsize(fpath)
        except OSError:
            pass

    elapsed_ms = int((time.monotonic() - start) * 1000)

    logger.info(
        "Bundle assembled: %d files, %d bytes, %d nodes, %d atlases (%dms)",
        len(all_files), total_size, node_count, atlas_count, elapsed_ms,
    )

    return {
        "bundlePath": str(bundle_dir),
        "bundleSize": total_size,
        "nodeCount": node_count,
        "atlasCount": atlas_count,
        "files": all_files,
    }


def _build_runtime_graph(graph: dict) -> dict:
    """Build a runtime-safe copy of the graph for graph.json.

    Strips binary data (imageBytes, large base64 blobs) while preserving
    the full structural, visual, and behavioral specifications that the
    graph-to-tree adapter and hub manager need at runtime.

    INVARIANT 1: The graph IS the app. We keep everything the runtime needs:
    nodes, edges, hubs, metadata, positions, visualSpec, behaviorSpec, atlasRegion.
    """
    runtime_nodes = []
    for node in graph.get("nodes", []):
        runtime_node = {
            "id": node.get("id"),
            "type": node.get("type"),
            "elementType": node.get("elementType"),
            "caption": node.get("caption"),
            "hubMemberships": node.get("hubMemberships", []),
            "position": node.get("position"),
            "visualSpec": node.get("visualSpec"),
            "behaviorSpec": node.get("behaviorSpec"),
            "atlasRegion": node.get("atlasRegion"),
            "dependencies": node.get("dependencies", []),
            "status": node.get("status"),
            # Code is loaded from individual node modules, not embedded in graph.json
            # codeHash is kept for cache invalidation
            "codeHash": node.get("codeHash"),
        }
        runtime_nodes.append(runtime_node)

    return {
        "id": graph.get("id"),
        "planId": graph.get("planId"),
        "projectId": graph.get("projectId"),
        "version": graph.get("version"),
        "nodes": runtime_nodes,
        "edges": graph.get("edges", []),
        "hubs": graph.get("hubs", []),
        "metadata": graph.get("metadata", {}),
    }


# ---------------------------------------------------------------------------
# HTML generation
# ---------------------------------------------------------------------------


def generate_index_html(graph: dict) -> str:
    """Generate the index.html entry point.

    Loads PixiJS v8 via CDN, GSAP via CDN, then app.js.
    Sets up the WebGPU canvas with a full-viewport container.

    No DOM text rendering (RED LINE 8) -- all text is handled by
    PixiJS BitmapText, Sharp+SVG composited textures, or MSDF shaders.
    """
    metadata = graph.get("metadata", {})
    project_id = graph.get("projectId", "app")

    # Determine initial hub for the page title
    hubs = graph.get("hubs", [])
    initial_hub_name = hubs[0].get("name", "Home") if hubs else "Home"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_escape_html(initial_hub_name)} - Kriptik Prism App</title>
  <style>
    *, *::before, *::after {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}
    html, body {{
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }}
    #app-canvas {{
      display: block;
      width: 100%;
      height: 100%;
    }}
    /* Loading overlay -- removed once PixiJS initializes */
    #loading-overlay {{
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      z-index: 9999;
      transition: opacity 0.3s ease;
    }}
  </style>
</head>
<body>
  <canvas id="app-canvas"></canvas>
  <div id="loading-overlay">Loading...</div>

  <script src="{_PIXI_CDN}"></script>
  <script src="{_GSAP_CDN}"></script>
  <script src="{_GSAP_PIXI_CDN}"></script>
  <script src="shared/state.js"></script>
  <script src="shared/animations.js"></script>
  <script src="shared/adapter.js"></script>
  <script src="shared/manager.js"></script>
  <script src="app.js"></script>
</body>
</html>"""


def _escape_html(text: str) -> str:
    """Minimal HTML escaping for attribute/text content."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


# ---------------------------------------------------------------------------
# App.js generation
# ---------------------------------------------------------------------------


def generate_app_js(graph: dict) -> str:
    """Generate app.js -- the main application script.

    Responsibilities:
    1. Initialize PixiJS v8 Application with WebGPU renderer (spec Section 13)
    2. Load the graph.json (INVARIANT 1: graph IS the app)
    3. Load texture atlases
    4. Initialize the hub manager
    5. Load and instantiate node modules for the initial hub
    6. Set up the graph-to-tree adapter
    7. Handle navigation between hubs (reparent-on-navigate, INVARIANT 8)
    """
    hubs = graph.get("hubs", [])
    initial_hub_id = hubs[0]["id"] if hubs else ""
    metadata = graph.get("metadata", {})
    atlas_count = metadata.get("atlasCount", 0)

    return f"""/**
 * Kriptik Prism -- PixiJS v8 Application
 *
 * INVARIANT 1: The graph IS the app. graph.json is loaded at runtime
 * and drives all rendering, navigation, and state management.
 *
 * INVARIANT 8: Bipartite DAG -> PixiJS single-parent tree via the
 * graph-to-tree adapter with reparent-on-navigate for shared nodes.
 *
 * Generated by Prism assembly worker. Do not edit manually.
 */
(async function() {{
  'use strict';

  const INITIAL_HUB_ID = '{_escape_js(initial_hub_id)}';
  const ATLAS_COUNT = {atlas_count};

  // -----------------------------------------------------------------------
  // 1. Initialize PixiJS v8 Application with WebGPU renderer
  // -----------------------------------------------------------------------

  const app = new PIXI.Application();

  await app.init({{
    canvas: document.getElementById('app-canvas'),
    preference: 'webgpu',
    width: window.innerWidth,
    height: window.innerHeight,
    antialias: true,
    backgroundColor: 0x000000,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  }});

  // Register GSAP PixiJS plugin
  if (typeof gsap !== 'undefined' && typeof PixiPlugin !== 'undefined') {{
    gsap.registerPlugin(PixiPlugin);
    PixiPlugin.registerPIXI(PIXI);
  }}

  // Handle viewport resize
  window.addEventListener('resize', function() {{
    app.renderer.resize(window.innerWidth, window.innerHeight);
  }});

  // -----------------------------------------------------------------------
  // 2. Load graph.json -- INVARIANT 1: the graph IS the app
  // -----------------------------------------------------------------------

  let graph;
  try {{
    const resp = await fetch('graph.json');
    if (!resp.ok) throw new Error('Failed to load graph.json: ' + resp.status);
    graph = await resp.json();
  }} catch (err) {{
    console.error('[Prism] Fatal: could not load graph.json', err);
    return;
  }}

  // -----------------------------------------------------------------------
  // 3. Load texture atlases
  // -----------------------------------------------------------------------

  const atlasTextures = new Map();

  for (let i = 0; i < ATLAS_COUNT; i++) {{
    try {{
      const tex = await PIXI.Assets.load('atlases/atlas-' + i + '.png');
      atlasTextures.set(i, tex);
    }} catch (err) {{
      console.warn('[Prism] Failed to load atlas-' + i + '.png:', err);
    }}
  }}

  // -----------------------------------------------------------------------
  // 4. Initialize application state
  // -----------------------------------------------------------------------

  const appState = new PrismState();

  // -----------------------------------------------------------------------
  // 5. Build node registry -- load per-node modules
  // -----------------------------------------------------------------------

  const nodeRegistry = new Map();

  async function loadNodeModule(nodeId) {{
    if (nodeRegistry.has(nodeId)) return nodeRegistry.get(nodeId);

    try {{
      const resp = await fetch('nodes/' + nodeId + '.js');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const code = await resp.text();

      // Each node module exports createNode(config) -> PIXI.Container
      // We wrap it in a function scope to isolate it.
      const moduleFactory = new Function(
        'PIXI', 'gsap', 'PrismAnimations', 'PrismState',
        '"use strict";\\n' + code + '\\nreturn typeof createNode === "function" ? createNode : null;'
      );

      const createNode = moduleFactory(PIXI, typeof gsap !== 'undefined' ? gsap : null, PrismAnimations, appState);

      if (typeof createNode !== 'function') {{
        console.warn('[Prism] Node module ' + nodeId + ' does not export createNode');
        return null;
      }}

      nodeRegistry.set(nodeId, createNode);
      return createNode;
    }} catch (err) {{
      console.error('[Prism] Failed to load node module ' + nodeId + ':', err);
      return null;
    }}
  }}

  // -----------------------------------------------------------------------
  // 6. Initialize graph-to-tree adapter
  // -----------------------------------------------------------------------

  const adapter = new GraphToTreeAdapter(graph, app, atlasTextures, appState);

  // Pre-load node modules for the initial hub
  if (INITIAL_HUB_ID) {{
    const initialHub = graph.hubs.find(function(h) {{ return h.id === INITIAL_HUB_ID; }});
    if (initialHub) {{
      const allNodeIds = (initialHub.nodeIds || []).concat(initialHub.sharedNodeIds || []);
      await Promise.all(allNodeIds.map(function(nid) {{ return loadNodeModule(nid); }}));
    }}
  }}

  // -----------------------------------------------------------------------
  // 7. Initialize hub manager and activate initial hub
  // -----------------------------------------------------------------------

  const hubManager = new PrismHubManager(graph, app, adapter, nodeRegistry, appState, loadNodeModule);

  if (INITIAL_HUB_ID) {{
    await hubManager.activateHub(INITIAL_HUB_ID);
  }}

  // Expose navigation globally for node event handlers
  window.__prismNavigate = function(targetHubId) {{
    hubManager.activateHub(targetHubId);
  }};

  // Expose app state globally for node event handlers
  window.__prismState = appState;

  // -----------------------------------------------------------------------
  // 8. Remove loading overlay
  // -----------------------------------------------------------------------

  var overlay = document.getElementById('loading-overlay');
  if (overlay) {{
    overlay.style.opacity = '0';
    setTimeout(function() {{
      overlay.remove();
    }}, 300);
  }}

  console.log('[Prism] Application initialized. Nodes: ' + graph.nodes.length + ', Hubs: ' + graph.hubs.length);
}})();
"""


def _escape_js(text: str) -> str:
    """Escape a string for safe inclusion in a JavaScript string literal."""
    return (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


# ---------------------------------------------------------------------------
# Hub manager
# ---------------------------------------------------------------------------


def generate_hub_manager_js(graph: dict) -> str:
    """Generate shared/manager.js -- hub navigation manager.

    Manages:
    - Current active hub
    - Hub transitions (fade, slide-left, slide-right)
    - Loading/unloading node modules when switching hubs
    - Shared node handling (nodes in multiple hubs stay loaded, reparented)
    """
    return """/**
 * Kriptik Prism -- Hub Manager
 *
 * Manages navigation between hubs (pages). Each hub is a PixiJS Render Group.
 * Shared nodes are reparented on navigate (INVARIANT 8).
 *
 * Generated by Prism assembly worker.
 */
var PrismHubManager = (function() {
  'use strict';

  function PrismHubManager(graph, app, adapter, nodeRegistry, appState, loadNodeModule) {
    this.graph = graph;
    this.app = app;
    this.adapter = adapter;
    this.nodeRegistry = nodeRegistry;
    this.appState = appState;
    this.loadNodeModule = loadNodeModule;
    this.activeHubId = null;
    this.hubContainers = new Map();
    this.instantiatedNodes = new Map();
    this._transitioning = false;
  }

  /**
   * Activate a hub by id. Handles transition animation, node loading,
   * and reparenting of shared nodes.
   */
  PrismHubManager.prototype.activateHub = async function(hubId) {
    if (this._transitioning) return;
    if (this.activeHubId === hubId) return;

    var hub = this.graph.hubs.find(function(h) { return h.id === hubId; });
    if (!hub) {
      console.warn('[Prism] Hub not found: ' + hubId);
      return;
    }

    this._transitioning = true;
    var previousHubId = this.activeHubId;

    // Determine transition animation
    var transitionType = 'fade';
    if (previousHubId) {
      var prevHub = this.graph.hubs.find(function(h) { return h.id === previousHubId; });
      if (prevHub && prevHub.transitions) {
        var transition = prevHub.transitions.find(function(t) { return t.targetHubId === hubId; });
        if (transition) {
          transitionType = transition.animation || 'fade';
        }
      }
    }

    // Get or create the container for this hub
    var container = this._getOrCreateHubContainer(hubId);

    // Load all node modules needed for this hub
    var allNodeIds = (hub.nodeIds || []).concat(hub.sharedNodeIds || []);
    await Promise.all(allNodeIds.map(function(nid) {
      return this.loadNodeModule(nid);
    }.bind(this)));

    // Instantiate nodes that are not yet instantiated
    for (var i = 0; i < allNodeIds.length; i++) {
      var nodeId = allNodeIds[i];
      if (!this.instantiatedNodes.has(nodeId)) {
        var createFn = this.nodeRegistry.get(nodeId);
        if (createFn) {
          var nodeData = this.graph.nodes.find(function(n) { return n.id === nodeId; });
          if (nodeData) {
            try {
              var displayObj = createFn({
                nodeId: nodeId,
                position: nodeData.position,
                visualSpec: nodeData.visualSpec,
                behaviorSpec: nodeData.behaviorSpec,
                atlasRegion: nodeData.atlasRegion,
                navigate: window.__prismNavigate,
                state: this.appState,
              });
              if (displayObj) {
                this.instantiatedNodes.set(nodeId, displayObj);
                this.adapter.registerNode(nodeId, displayObj);
              }
            } catch (err) {
              console.error('[Prism] Failed to instantiate node ' + nodeId + ':', err);
            }
          }
        }
      }
    }

    // Perform the hub transition using the adapter
    if (previousHubId) {
      await this._transitionHubs(previousHubId, hubId, transitionType);
    } else {
      // First activation -- no transition needed
      this.adapter.activateHub(hubId);
      container.visible = true;
    }

    // Clear hub-scoped state
    this.appState.clearScope('hub');

    this.activeHubId = hubId;
    this._transitioning = false;
  };

  /**
   * Get or create a PixiJS container for a hub.
   * Each hub container is a Render Group (PixiJS v8).
   */
  PrismHubManager.prototype._getOrCreateHubContainer = function(hubId) {
    if (this.hubContainers.has(hubId)) {
      return this.hubContainers.get(hubId);
    }

    var container = new PIXI.Container();
    container.isRenderGroup = true;
    container.visible = false;
    container.label = 'hub-' + hubId;

    this.app.stage.addChild(container);
    this.hubContainers.set(hubId, container);
    this.adapter.registerHubContainer(hubId, container);

    return container;
  };

  /**
   * Animate the transition between two hubs.
   */
  PrismHubManager.prototype._transitionHubs = function(fromHubId, toHubId, transitionType) {
    var self = this;
    var fromContainer = this.hubContainers.get(fromHubId);
    var toContainer = this._getOrCreateHubContainer(toHubId);

    // Reparent shared nodes to the new hub before showing it
    self.adapter.activateHub(toHubId);

    return new Promise(function(resolve) {
      if (typeof gsap === 'undefined' || transitionType === 'none') {
        // No animation library or no animation requested
        if (fromContainer) fromContainer.visible = false;
        toContainer.visible = true;
        toContainer.alpha = 1;
        resolve();
        return;
      }

      var stageWidth = self.app.renderer.width;

      switch (transitionType) {
        case 'slide-left':
          toContainer.position.x = stageWidth;
          toContainer.visible = true;
          toContainer.alpha = 1;
          gsap.to(fromContainer, {
            pixi: { x: -stageWidth },
            duration: 0.4,
            ease: 'power2.inOut',
          });
          gsap.to(toContainer, {
            pixi: { x: 0 },
            duration: 0.4,
            ease: 'power2.inOut',
            onComplete: function() {
              if (fromContainer) fromContainer.visible = false;
              fromContainer.position.x = 0;
              resolve();
            },
          });
          break;

        case 'slide-right':
          toContainer.position.x = -stageWidth;
          toContainer.visible = true;
          toContainer.alpha = 1;
          gsap.to(fromContainer, {
            pixi: { x: stageWidth },
            duration: 0.4,
            ease: 'power2.inOut',
          });
          gsap.to(toContainer, {
            pixi: { x: 0 },
            duration: 0.4,
            ease: 'power2.inOut',
            onComplete: function() {
              if (fromContainer) fromContainer.visible = false;
              fromContainer.position.x = 0;
              resolve();
            },
          });
          break;

        case 'fade':
        default:
          toContainer.alpha = 0;
          toContainer.visible = true;
          gsap.to(fromContainer, {
            pixi: { alpha: 0 },
            duration: 0.3,
            ease: 'power2.out',
            onComplete: function() {
              if (fromContainer) fromContainer.visible = false;
              fromContainer.alpha = 1;
            },
          });
          gsap.to(toContainer, {
            pixi: { alpha: 1 },
            duration: 0.3,
            ease: 'power2.out',
            delay: 0.15,
            onComplete: function() {
              resolve();
            },
          });
          break;
      }
    });
  };

  return PrismHubManager;
})();
"""


# ---------------------------------------------------------------------------
# Graph-to-tree adapter
# ---------------------------------------------------------------------------


def generate_adapter_js() -> str:
    """Generate shared/adapter.js -- graph-to-tree adapter.

    INVARIANT 8: Bipartite DAG -> PixiJS single-parent tree.

    The graph has many-to-many relationships (nodes can be in multiple hubs).
    PixiJS requires single-parent (each DisplayObject has one parent).

    The adapter:
    1. Reads graph.json at runtime
    2. For the current hub, creates PixiJS Container hierarchy
    3. On navigate: reparents shared nodes (removes from old parent, adds to new)
    4. Handles per-hub property overrides for shared components
    """
    return """/**
 * Kriptik Prism -- Graph-to-Tree Adapter
 *
 * INVARIANT 8: Bipartite DAG -> PixiJS single-parent tree.
 *
 * The knowledge graph allows many-to-many relationships between nodes and hubs.
 * PixiJS requires each DisplayObject to have exactly one parent Container.
 * This adapter bridges the two models via reparent-on-navigate.
 *
 * Shared nodes (nav, footer, etc.) exist once canonically in the graph but
 * are reparented to whichever hub is currently active.
 *
 * Generated by Prism assembly worker.
 */
var GraphToTreeAdapter = (function() {
  'use strict';

  function GraphToTreeAdapter(graph, app, atlasTextures, appState) {
    this.graph = graph;
    this.app = app;
    this.atlasTextures = atlasTextures;
    this.appState = appState;

    // hubId -> PIXI.Container
    this.hubContainers = new Map();
    // nodeId -> PIXI.DisplayObject (instantiated node)
    this.nodeDisplayObjects = new Map();
    // nodeId -> Set<hubId> (which hubs this node belongs to)
    this.nodeHubMemberships = new Map();

    this.activeHubId = null;

    // Build membership index from graph data
    this._buildMembershipIndex();
  }

  /**
   * Build the node -> hub membership index from graph data.
   */
  GraphToTreeAdapter.prototype._buildMembershipIndex = function() {
    var nodes = this.graph.nodes || [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var memberships = node.hubMemberships || [];
      this.nodeHubMemberships.set(node.id, new Set(memberships));
    }
  };

  /**
   * Register a hub container so the adapter can manage it.
   */
  GraphToTreeAdapter.prototype.registerHubContainer = function(hubId, container) {
    this.hubContainers.set(hubId, container);
  };

  /**
   * Register an instantiated node's display object.
   */
  GraphToTreeAdapter.prototype.registerNode = function(nodeId, displayObject) {
    this.nodeDisplayObjects.set(nodeId, displayObject);
  };

  /**
   * Activate a hub: reparent all relevant nodes into its container.
   *
   * For each node that belongs to this hub:
   *   - If the node is a shared node (in multiple hubs), reparent it from
   *     its current parent to this hub's container. PixiJS handles the
   *     removeChild automatically when addChild is called on a new parent.
   *   - If the node is hub-specific, add it to this hub's container.
   *
   * Position and property overrides are applied per-hub.
   */
  GraphToTreeAdapter.prototype.activateHub = function(hubId) {
    var hub = this.graph.hubs.find(function(h) { return h.id === hubId; });
    if (!hub) {
      console.warn('[Prism Adapter] Hub not found: ' + hubId);
      return;
    }

    var container = this.hubContainers.get(hubId);
    if (!container) {
      console.warn('[Prism Adapter] No container registered for hub: ' + hubId);
      return;
    }

    // Gather all node IDs for this hub (own + shared)
    var allNodeIds = (hub.nodeIds || []).concat(hub.sharedNodeIds || []);

    // Reparent each node into this hub's container
    for (var i = 0; i < allNodeIds.length; i++) {
      var nodeId = allNodeIds[i];
      var displayObj = this.nodeDisplayObjects.get(nodeId);
      if (!displayObj) continue;

      // Look up position from graph node data
      var nodeData = this.graph.nodes.find(function(n) { return n.id === nodeId; });

      // PixiJS v8: addChild automatically removes from previous parent
      container.addChild(displayObj);

      // Apply position from the graph
      if (nodeData && nodeData.position) {
        displayObj.position.set(
          nodeData.position.x || 0,
          nodeData.position.y || 0
        );
        displayObj.zIndex = nodeData.position.z || 0;
      }

      // Apply per-hub property overrides if specified in hub metadata
      var overrides = (hub.metadata || {}).__nodeOverrides;
      if (overrides && overrides[nodeId]) {
        this._applyOverrides(displayObj, overrides[nodeId]);
      }
    }

    // Enable sortable children for z-index ordering
    container.sortableChildren = true;

    this.activeHubId = hubId;
  };

  /**
   * Apply per-hub property overrides to a display object.
   * Overrides can include position, visibility, alpha, scale, and tint.
   */
  GraphToTreeAdapter.prototype._applyOverrides = function(displayObj, overrides) {
    if (overrides.x !== undefined || overrides.y !== undefined) {
      displayObj.position.set(
        overrides.x !== undefined ? overrides.x : displayObj.position.x,
        overrides.y !== undefined ? overrides.y : displayObj.position.y
      );
    }
    if (overrides.visible !== undefined) {
      displayObj.visible = overrides.visible;
    }
    if (overrides.alpha !== undefined) {
      displayObj.alpha = overrides.alpha;
    }
    if (overrides.scaleX !== undefined || overrides.scaleY !== undefined) {
      displayObj.scale.set(
        overrides.scaleX !== undefined ? overrides.scaleX : displayObj.scale.x,
        overrides.scaleY !== undefined ? overrides.scaleY : displayObj.scale.y
      );
    }
    if (overrides.tint !== undefined) {
      displayObj.tint = overrides.tint;
    }
  };

  /**
   * Get the atlas texture and source rectangle for a node.
   * Returns null if the node has no atlas region.
   */
  GraphToTreeAdapter.prototype.getNodeTexture = function(nodeId) {
    var nodeData = this.graph.nodes.find(function(n) { return n.id === nodeId; });
    if (!nodeData || !nodeData.atlasRegion) return null;

    var region = nodeData.atlasRegion;
    var baseTexture = this.atlasTextures.get(region.atlasIndex);
    if (!baseTexture) return null;

    // Create a sub-texture from the atlas
    var frame = new PIXI.Rectangle(region.x, region.y, region.width, region.height);
    return new PIXI.Texture({ source: baseTexture.source, frame: frame });
  };

  /**
   * Check if a node is shared (belongs to more than one hub).
   */
  GraphToTreeAdapter.prototype.isSharedNode = function(nodeId) {
    var memberships = this.nodeHubMemberships.get(nodeId);
    return memberships ? memberships.size > 1 : false;
  };

  /**
   * Get all node IDs that are currently in the active hub.
   */
  GraphToTreeAdapter.prototype.getActiveNodeIds = function() {
    if (!this.activeHubId) return [];
    var hub = this.graph.hubs.find(function(h) { return h.id === this.activeHubId; }.bind(this));
    if (!hub) return [];
    return (hub.nodeIds || []).concat(hub.sharedNodeIds || []);
  };

  return GraphToTreeAdapter;
})();
"""


# ---------------------------------------------------------------------------
# Animation utilities
# ---------------------------------------------------------------------------


def generate_animations_js() -> str:
    """Generate shared/animations.js -- GSAP animation utilities.

    Provides helper functions for common animations:
    - fadeIn/fadeOut
    - slideIn/slideOut
    - scaleIn/scaleOut
    - hover effects (scale, glow)
    - Hub transition animations

    All animations use GSAP targeting PixiJS display objects.
    """
    return """/**
 * Kriptik Prism -- Shared Animation Utilities
 *
 * GSAP-based animation helpers for PixiJS display objects.
 * Node modules can reference these via the PrismAnimations global.
 *
 * Generated by Prism assembly worker.
 */
var PrismAnimations = (function() {
  'use strict';

  var _gsap = typeof gsap !== 'undefined' ? gsap : null;

  function _checkGsap() {
    if (!_gsap) {
      console.warn('[PrismAnimations] GSAP not available, animation skipped');
      return false;
    }
    return true;
  }

  // -----------------------------------------------------------------------
  // Fade
  // -----------------------------------------------------------------------

  function fadeIn(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    target.alpha = 0;
    target.visible = true;
    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { alpha: 1 },
        duration: opts.duration || 0.3,
        ease: opts.ease || 'power2.out',
        delay: opts.delay || 0,
        onComplete: resolve,
      });
    });
  }

  function fadeOut(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { alpha: 0 },
        duration: opts.duration || 0.3,
        ease: opts.ease || 'power2.in',
        delay: opts.delay || 0,
        onComplete: function() {
          target.visible = false;
          resolve();
        },
      });
    });
  }

  // -----------------------------------------------------------------------
  // Slide
  // -----------------------------------------------------------------------

  function slideIn(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    var direction = opts.direction || 'left';
    var distance = opts.distance || 100;
    var startX = target.position.x;
    var startY = target.position.y;

    switch (direction) {
      case 'left':   target.position.x = startX - distance; break;
      case 'right':  target.position.x = startX + distance; break;
      case 'up':     target.position.y = startY - distance; break;
      case 'down':   target.position.y = startY + distance; break;
    }

    target.alpha = 0;
    target.visible = true;

    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { x: startX, y: startY, alpha: 1 },
        duration: opts.duration || 0.4,
        ease: opts.ease || 'power2.out',
        delay: opts.delay || 0,
        onComplete: resolve,
      });
    });
  }

  function slideOut(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    var direction = opts.direction || 'left';
    var distance = opts.distance || 100;
    var endX = target.position.x;
    var endY = target.position.y;

    switch (direction) {
      case 'left':   endX -= distance; break;
      case 'right':  endX += distance; break;
      case 'up':     endY -= distance; break;
      case 'down':   endY += distance; break;
    }

    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { x: endX, y: endY, alpha: 0 },
        duration: opts.duration || 0.4,
        ease: opts.ease || 'power2.in',
        delay: opts.delay || 0,
        onComplete: function() {
          target.visible = false;
          resolve();
        },
      });
    });
  }

  // -----------------------------------------------------------------------
  // Scale
  // -----------------------------------------------------------------------

  function scaleIn(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    target.scale.set(0, 0);
    target.alpha = 0;
    target.visible = true;

    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { scaleX: 1, scaleY: 1, alpha: 1 },
        duration: opts.duration || 0.4,
        ease: opts.ease || 'back.out(1.7)',
        delay: opts.delay || 0,
        onComplete: resolve,
      });
    });
  }

  function scaleOut(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    return new Promise(function(resolve) {
      _gsap.to(target, {
        pixi: { scaleX: 0, scaleY: 0, alpha: 0 },
        duration: opts.duration || 0.3,
        ease: opts.ease || 'back.in(1.7)',
        delay: opts.delay || 0,
        onComplete: function() {
          target.visible = false;
          target.scale.set(1, 1);
          resolve();
        },
      });
    });
  }

  // -----------------------------------------------------------------------
  // Hover effects
  // -----------------------------------------------------------------------

  /**
   * Attach hover scale effect to a display object.
   * The object must have eventMode = 'static' or 'dynamic' set.
   */
  function attachHoverScale(target, options) {
    var opts = options || {};
    var scaleFactor = opts.scale || 1.05;
    var duration = opts.duration || 0.2;
    var ease = opts.ease || 'power2.out';

    target.eventMode = target.eventMode || 'static';
    target.cursor = 'pointer';

    target.on('pointerover', function() {
      if (_gsap) {
        _gsap.to(target, {
          pixi: { scaleX: scaleFactor, scaleY: scaleFactor },
          duration: duration,
          ease: ease,
        });
      }
    });

    target.on('pointerout', function() {
      if (_gsap) {
        _gsap.to(target, {
          pixi: { scaleX: 1, scaleY: 1 },
          duration: duration,
          ease: ease,
        });
      }
    });
  }

  /**
   * Attach a glow effect on hover using PixiJS filters.
   * Requires the @pixi/filter-glow or equivalent to be loaded.
   * Falls back to alpha adjustment if glow filter is not available.
   */
  function attachHoverGlow(target, options) {
    var opts = options || {};
    var glowColor = opts.color || 0xffffff;
    var glowStrength = opts.strength || 2;
    var duration = opts.duration || 0.3;

    target.eventMode = target.eventMode || 'static';

    target.on('pointerover', function() {
      if (_gsap) {
        _gsap.to(target, {
          pixi: { alpha: Math.min(target.alpha + 0.1, 1) },
          duration: duration,
          ease: 'power2.out',
        });
      }
    });

    target.on('pointerout', function() {
      if (_gsap) {
        _gsap.to(target, {
          pixi: { alpha: 1 },
          duration: duration,
          ease: 'power2.out',
        });
      }
    });
  }

  // -----------------------------------------------------------------------
  // Bounce
  // -----------------------------------------------------------------------

  function bounce(target, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    var intensity = opts.intensity || 0.3;
    var duration = opts.duration || 0.6;

    return new Promise(function(resolve) {
      var tl = _gsap.timeline({ onComplete: resolve });
      tl.to(target, {
        pixi: { scaleX: 1 + intensity, scaleY: 1 - intensity * 0.5 },
        duration: duration * 0.3,
        ease: 'power2.out',
      });
      tl.to(target, {
        pixi: { scaleX: 1 - intensity * 0.3, scaleY: 1 + intensity * 0.3 },
        duration: duration * 0.3,
        ease: 'power2.inOut',
      });
      tl.to(target, {
        pixi: { scaleX: 1, scaleY: 1 },
        duration: duration * 0.4,
        ease: 'elastic.out(1, 0.3)',
      });
    });
  }

  // -----------------------------------------------------------------------
  // Stagger (animate a list of children sequentially)
  // -----------------------------------------------------------------------

  function staggerIn(targets, options) {
    if (!_checkGsap()) return Promise.resolve();
    var opts = options || {};
    var staggerDelay = opts.stagger || 0.05;
    var type = opts.type || 'fade';

    var promises = [];
    for (var i = 0; i < targets.length; i++) {
      var delay = i * staggerDelay + (opts.delay || 0);
      var childOpts = { duration: opts.duration, ease: opts.ease, delay: delay };

      switch (type) {
        case 'slide':
          childOpts.direction = opts.direction;
          childOpts.distance = opts.distance;
          promises.push(slideIn(targets[i], childOpts));
          break;
        case 'scale':
          promises.push(scaleIn(targets[i], childOpts));
          break;
        case 'fade':
        default:
          promises.push(fadeIn(targets[i], childOpts));
          break;
      }
    }

    return Promise.all(promises);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    fadeIn: fadeIn,
    fadeOut: fadeOut,
    slideIn: slideIn,
    slideOut: slideOut,
    scaleIn: scaleIn,
    scaleOut: scaleOut,
    bounce: bounce,
    staggerIn: staggerIn,
    attachHoverScale: attachHoverScale,
    attachHoverGlow: attachHoverGlow,
  };
})();
"""


# ---------------------------------------------------------------------------
# Application state management
# ---------------------------------------------------------------------------


def generate_state_js() -> str:
    """Generate shared/state.js -- application state management.

    Simple reactive state system:
    - Global state (persists across hub navigation)
    - Hub-scoped state (cleared on hub change)
    - Local state (per-node, cleared on unload)
    - subscribe/publish pattern for state updates
    """
    return """/**
 * Kriptik Prism -- Application State Management
 *
 * Reactive state system with three scopes:
 *   - global: persists across hub navigation
 *   - hub: cleared on hub change
 *   - local: per-node, cleared on node unload
 *
 * Nodes access state through the PrismState instance passed at construction.
 * State changes trigger subscribed listeners.
 *
 * Generated by Prism assembly worker.
 */
var PrismState = (function() {
  'use strict';

  function PrismState() {
    // State stores keyed by scope
    this._stores = {
      global: {},
      hub: {},
      local: {},
    };

    // Subscriber lists keyed by "scope:key"
    this._subscribers = new Map();

    // Subscriber ID counter for unsubscribe
    this._nextSubId = 1;
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Get a state value.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {string} key - The state key
   * @param {*} [defaultValue] - Returned if key is not set
   */
  PrismState.prototype.get = function(scope, key, defaultValue) {
    var store = this._stores[scope];
    if (!store) return defaultValue;
    return store.hasOwnProperty(key) ? store[key] : defaultValue;
  };

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /**
   * Set a state value and notify subscribers.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {string} key - The state key
   * @param {*} value - The new value
   */
  PrismState.prototype.set = function(scope, key, value) {
    var store = this._stores[scope];
    if (!store) {
      console.warn('[PrismState] Unknown scope: ' + scope);
      return;
    }

    var oldValue = store[key];
    store[key] = value;

    // Notify subscribers
    this._notify(scope, key, value, oldValue);
  };

  /**
   * Update a state value using a transform function.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {string} key - The state key
   * @param {function} updater - Function receiving current value, returns new value
   */
  PrismState.prototype.update = function(scope, key, updater) {
    var current = this.get(scope, key);
    var next = updater(current);
    this.set(scope, key, next);
  };

  // -----------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // -----------------------------------------------------------------------

  /**
   * Subscribe to changes on a specific state key.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {string} key - The state key
   * @param {function} callback - Called with (newValue, oldValue)
   * @returns {number} Subscription ID (use to unsubscribe)
   */
  PrismState.prototype.subscribe = function(scope, key, callback) {
    var subKey = scope + ':' + key;
    if (!this._subscribers.has(subKey)) {
      this._subscribers.set(subKey, new Map());
    }

    var id = this._nextSubId++;
    this._subscribers.get(subKey).set(id, callback);
    return id;
  };

  /**
   * Unsubscribe by subscription ID.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {string} key - The state key
   * @param {number} subId - The subscription ID returned by subscribe()
   */
  PrismState.prototype.unsubscribe = function(scope, key, subId) {
    var subKey = scope + ':' + key;
    var subs = this._subscribers.get(subKey);
    if (subs) {
      subs.delete(subId);
    }
  };

  // -----------------------------------------------------------------------
  // Scope management
  // -----------------------------------------------------------------------

  /**
   * Clear all state in a given scope.
   * Called by the hub manager on hub navigation (clears 'hub' scope).
   * @param {string} scope - 'global', 'hub', or 'local'
   */
  PrismState.prototype.clearScope = function(scope) {
    if (!this._stores[scope]) return;
    this._stores[scope] = {};

    // Notify all subscribers in this scope that their keys are gone
    var prefix = scope + ':';
    this._subscribers.forEach(function(subs, subKey) {
      if (subKey.indexOf(prefix) === 0) {
        subs.forEach(function(cb) {
          try {
            cb(undefined, undefined);
          } catch (err) {
            console.error('[PrismState] Subscriber error on scope clear:', err);
          }
        });
      }
    });
  };

  /**
   * Clear local state for a specific node.
   * @param {string} nodeId - The node whose local state to clear
   */
  PrismState.prototype.clearNodeState = function(nodeId) {
    var store = this._stores.local;
    var prefix = nodeId + '.';
    var keys = Object.keys(store);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(prefix) === 0 || keys[i] === nodeId) {
        delete store[keys[i]];
      }
    }
  };

  // -----------------------------------------------------------------------
  // Bulk operations
  // -----------------------------------------------------------------------

  /**
   * Get all state in a scope as a plain object snapshot.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @returns {Object} Shallow copy of the scope's state
   */
  PrismState.prototype.getAll = function(scope) {
    var store = this._stores[scope] || {};
    var result = {};
    var keys = Object.keys(store);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = store[keys[i]];
    }
    return result;
  };

  /**
   * Merge multiple key-value pairs into a scope, notifying subscribers
   * for each changed key.
   * @param {string} scope - 'global', 'hub', or 'local'
   * @param {Object} values - Key-value pairs to merge
   */
  PrismState.prototype.merge = function(scope, values) {
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) {
      this.set(scope, keys[i], values[keys[i]]);
    }
  };

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  PrismState.prototype._notify = function(scope, key, newValue, oldValue) {
    var subKey = scope + ':' + key;
    var subs = this._subscribers.get(subKey);
    if (!subs) return;

    subs.forEach(function(cb) {
      try {
        cb(newValue, oldValue);
      } catch (err) {
        console.error('[PrismState] Subscriber error for ' + subKey + ':', err);
      }
    });
  };

  return PrismState;
})();
"""


# ---------------------------------------------------------------------------
# Bundle hashing
# ---------------------------------------------------------------------------


def calculate_bundle_hash(bundle_path: str) -> str:
    """Calculate SHA256 hash of the complete bundle for cache invalidation.

    Walks the bundle directory, reads every file, and hashes the
    sorted (path, content) pairs to produce a deterministic digest.

    Args:
        bundle_path: Absolute path to the bundle root directory.

    Returns:
        Hex-encoded SHA256 hash string.
    """
    hasher = hashlib.sha256()
    bundle_root = Path(bundle_path)

    if not bundle_root.is_dir():
        logger.warning("Bundle path does not exist: %s", bundle_path)
        return hasher.hexdigest()

    # Collect all files, sorted by relative path for determinism
    file_entries: list[tuple[str, Path]] = []
    for fpath in bundle_root.rglob("*"):
        if fpath.is_file():
            rel = str(fpath.relative_to(bundle_root))
            file_entries.append((rel, fpath))

    file_entries.sort(key=lambda e: e[0])

    for rel_path, abs_path in file_entries:
        # Hash the relative path (so structure changes are detected)
        hasher.update(rel_path.encode("utf-8"))
        # Hash the file contents
        try:
            hasher.update(abs_path.read_bytes())
        except OSError as exc:
            logger.warning("Could not read %s for hashing: %s", abs_path, exc)

    return hasher.hexdigest()


# ---------------------------------------------------------------------------
# Single-Node Module Swap (Phase 9: Editing)
# ---------------------------------------------------------------------------


def swap_node_module(
    source_bundle_dir: str,
    target_bundle_dir: str,
    node_id: str,
    new_code: str,
    graph: dict,
) -> dict:
    """Swap a single node's module file for a single-node edit.

    Copies the entire bundle from source to target, then replaces ONLY
    the edited node's .js file and graph.json. Atlas is NOT repacked.
    Neighbor node modules are copied unchanged.

    This enables $0.001-0.01 edits vs $0.13 for a full rebuild.

    Args:
        source_bundle_dir: Path to the previous version's bundle.
        target_bundle_dir: Path for the new version's bundle.
        node_id: ID of the node being edited.
        new_code: The regenerated code for the node.
        graph: The updated graph dict (with new version, updated node).

    Returns:
        { "bundlePath": str, "swappedNode": str, "bundleSize": int }
    """
    source = Path(source_bundle_dir)
    target = Path(target_bundle_dir)

    # Copy the entire bundle structure from previous version
    if source.is_dir() and source != target:
        import shutil
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        logger.info("Copied bundle from %s to %s", source, target)
    else:
        target.mkdir(parents=True, exist_ok=True)

    # Swap ONLY the edited node's module file
    nodes_dir = target / "nodes"
    nodes_dir.mkdir(parents=True, exist_ok=True)
    node_path = nodes_dir / f"{node_id}.js"
    if new_code:
        node_path.write_text(new_code, encoding="utf-8")
        logger.info("Swapped node module: %s (%d bytes)", node_path, len(new_code))

    # Update graph.json with the new graph state
    runtime_graph = _build_runtime_graph(graph)
    graph_json_path = target / "graph.json"
    graph_json_path.write_text(
        json.dumps(runtime_graph, indent=2), encoding="utf-8"
    )
    logger.info("Updated graph.json for version %s", graph.get("version"))

    # Calculate total bundle size
    total_size = sum(
        f.stat().st_size for f in target.rglob("*") if f.is_file()
    )

    return {
        "bundlePath": str(target),
        "swappedNode": node_id,
        "bundleSize": total_size,
    }
