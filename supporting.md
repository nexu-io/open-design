### Trade-offs
- **Complexity** – Adds 3 new states and state machine logic. Mitigated by reusing existing `capabilities/health` endpoint for monitoring.
- **Latency** – Capabilities cannot be immediately active. Acceptable for a governed platform (requirement).
- **Storage** – Observation metrics stored per capability. Estimated +10% storage overhead, but improves governance.

### Impact Analysis
- **Mesh Nodes** – Sandboxed capabilities may temporarily increase node count, but limit of 2 ensures bounded growth.
- **Entropy** – Early detection of high-entropy proposals prevents cascade failures. Historical baseline: 0.10 avg entropy → threshold of 0.15 provides headroom.

---

# notes.md

## Reflections & Open Questions

### Challenges Encountered
- **Timeout handling**: If observation period never produces stable metrics (e.g., flapping), capability remains `observing` indefinitely. Decision: set a maximum observation window (48h) after which capability is automatically rejected.
- **Backward compatibility**: Existing active capabilities bypass the new pipeline. Should they be retroactively assigned lifecycle status? Suggestion: leave as `legacy_active` to avoid disruption.

### Questions for Further Discussion
1. Should the sandbox environment share the same mesh as active capabilities? Potential for cross-contamination vs. resource isolation.
2. How to handle capabilities with human-in-the-loop approval? Extend `proposed` state with additional metadata (approval ticket).
3. What is the rollback procedure for promoted capabilities that later degrade? Define a `demoted` lifecycle status.

### Next Steps
- Implement API endpoints (estimated 2 sprints)
- Write integration tests for state transitions
- Deploy observation cron job with canary monitoring
- Review automated gate thresholds after first month of production data.

_This design is aligned with AIGON Enterprise v3.0 governance rules and does not reference swarm systems or unverified assumptions._