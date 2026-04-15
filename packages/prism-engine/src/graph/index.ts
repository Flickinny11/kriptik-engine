/**
 * graph/ -- Knowledge graph construction, atlas packing, tree conversion,
 * and shared node management for the Prism engine.
 *
 * These TypeScript modules mirror the graph logic from the Python Modal
 * workers. The heavy ML work (SAM segmentation, FLUX image gen) runs in
 * Python on Modal; these modules provide the graph manipulation, atlas
 * packing, and tree conversion logic for the TypeScript side of the pipeline.
 */

export * from './graph-construction.js';
export * from './atlas-packer.js';
export * from './graph-to-tree.js';
export * from './shared-nodes.js';
