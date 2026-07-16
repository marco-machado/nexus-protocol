# Order-denial reasons come from shared read-only sim queries

The intent cursor and the order feedback grammar need to know before issuing a command whether it would be denied and why (out of range, no line of sight, persuasion-immune). These answers come from pure read-only query helpers exported by the sim and called from the app layer, never from app-side reimplementations of range, line-of-sight, or immunity rules. App importing sim is the permitted dependency direction; duplicated rule logic would drift silently and make the cursor lie about what the sim will accept.

## Consequences

The sim grows a small public query surface (pure functions over `SimState` and `MapData`, no mutation, no RNG consumption, so no determinism impact). Any change to an order's validity rule automatically updates the cursor's prediction.
