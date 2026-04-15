/**
 * Communication infrastructure interfaces — the Protocol Triangle composing
 * MCP (agent-to-tool), A2A (agent-to-agent), and AG-UI (agent-to-user).
 *
 * Spec Section 3.3 — Graph-Mesh Peer Communication
 * Spec Communication Infrastructure section — The Protocol Triangle
 */

// ---------------------------------------------------------------------------
// Graph-mesh peer messaging (A2A layer)
// ---------------------------------------------------------------------------

/** Types of peer messages exchanged via the graph-mesh. */
export type PeerMessageType =
  | "interface-proposal"     // Proposing a new or modified interface contract
  | "interface-feedback"     // Feedback on a peer's interface proposal
  | "modification-request"   // Requesting a change in a peer's module
  | "notification"           // One-way notification (e.g. subscription status props)
  | "escalation"             // Escalating to the Cortex for replanning
  | "acknowledgment";        // Confirming receipt

/**
 * IPeerMessage — a message between agents in the graph-mesh.
 *
 * Agents with bidirectional connections send messages directly to each other.
 * The Cortex subscribes to all channels for awareness and trail capture but
 * doesn't route or approve these messages.
 *
 * Spec Section 3.3 — "Agents negotiate directly."
 */
export interface IPeerMessage {
  /** Unique message identifier. */
  readonly id: string;
  /** Sending agent session ID. */
  readonly fromAgentId: string;
  /** Receiving agent session ID. */
  readonly toAgentId: string;
  /** Message type. */
  readonly type: PeerMessageType;
  /** Message content. */
  readonly content: string;
  /** Optional structured payload (e.g. interface definition for proposals). */
  readonly payload?: Record<string, unknown>;
  /** When the message was sent. */
  readonly sentAt: Date;
  /** ID of the message this is replying to, if applicable. */
  readonly replyTo?: string;
}

// ---------------------------------------------------------------------------
// Graph-mesh configuration
// ---------------------------------------------------------------------------

/**
 * IGraphMeshConfig — defines the peer communication topology for a build.
 *
 * The Cortex constructs this based on the task dependency map.
 * Spec Section 3.3 — "When the Cortex assigns goals, it also constructs
 * a peer communication graph."
 */
export interface IGraphMeshConfig {
  readonly buildId: string;
  /** Edges in the communication graph. */
  readonly edges: readonly IGraphEdge[];
}

/** A single edge in the peer communication graph. */
export interface IGraphEdge {
  /** First agent in the connection. */
  readonly agentA: string;
  /** Second agent in the connection. */
  readonly agentB: string;
  /** Whether communication flows both ways or is one-directional. */
  readonly direction: "bidirectional" | "a-to-b" | "b-to-a";
  /** Why these agents need to communicate. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Pub/sub events (internal event bus)
// ---------------------------------------------------------------------------

/** Event types broadcast on the internal pub/sub bus. */
export type PubSubEventType =
  | "merge-complete"         // A goal merged to integration
  | "agent-rotated"          // An agent was rotated
  | "agent-fired"            // An agent was fired
  | "blueprint-revised"      // The Architect revised the blueprint
  | "spec-updated"           // The living specification was updated
  | "verification-complete"  // A UX verification team completed
  | "goal-eligible"          // A new goal became eligible (dependencies met)
  | "build-phase-changed";   // The build transitioned to a new phase

/** A pub/sub event broadcast to all interested parties. */
export interface IPubSubEvent {
  readonly type: PubSubEventType;
  readonly buildId: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: Date;
}
