/**
 * ESAA event emission from agent sessions.
 *
 * Captures structured intentions from agent actions and persists them
 * to the append-only event log with SHA-256 integrity hashing.
 *
 * Spec Section 5.5 — Event-Sourced Intention Logs (ESAA).
 * "Separating cognitive intention from state mutation enables
 * time-travel debugging via event replay."
 */

import { createHash } from "node:crypto";
import type { IESAAEvent, ESAAEventCategory } from "@kriptik/shared-interfaces";

/** Handler called when an ESAA event is emitted. */
export type ESAAEventHandler = (event: IESAAEvent) => void;

/**
 * Emits ESAA events from an agent session.
 *
 * Each event is hashed with the previous event's hash to form
 * an integrity chain — any tampering or reordering is detectable.
 */
export class ESAAEmitter {
  private _lastHash = "0".repeat(64); // Genesis hash
  private _sequence = 0;
  private readonly _handlers: ESAAEventHandler[] = [];

  constructor(
    private readonly _buildId: string,
    private readonly _agentId: string,
  ) {}

  /** Subscribe to emitted events. */
  onEvent(handler: ESAAEventHandler): void {
    this._handlers.push(handler);
  }

  /**
   * Emit an ESAA event.
   *
   * Computes the SHA-256 integrity hash as:
   *   hash(previousHash + eventId + category + description + timestamp)
   *
   * This chain ensures events cannot be reordered, removed, or modified
   * without breaking the integrity verification.
   */
  emit(
    category: ESAAEventCategory,
    description: string,
    payload: Record<string, unknown> = {},
  ): IESAAEvent {
    this._sequence++;
    const id = `${this._buildId}:${this._agentId}:${this._sequence}`;
    const timestamp = new Date();

    const hashInput = [
      this._lastHash,
      id,
      category,
      description,
      timestamp.toISOString(),
    ].join("|");

    const integrityHash = createHash("sha256")
      .update(hashInput)
      .digest("hex");

    const event: IESAAEvent = {
      id,
      buildId: this._buildId,
      agentId: this._agentId,
      category,
      description,
      payload,
      integrityHash,
      timestamp,
    };

    this._lastHash = integrityHash;

    for (const handler of this._handlers) {
      handler(event);
    }

    return event;
  }

  /** Current integrity hash (the head of the chain). */
  get currentHash(): string {
    return this._lastHash;
  }

  /** Total events emitted by this agent. */
  get eventCount(): number {
    return this._sequence;
  }
}
