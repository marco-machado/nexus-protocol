# Feature Specification: Multiplayer and Accounts

**Created**: 2026-07-05

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Two-Player Co-op Mission (Priority: P1)

Two friends play a mission together. Each player controls two agents of the shared four-agent squad, sees the same mission unfold identically, and shares the outcome (loot, casualties, territory effects) in the host's campaign. Because both players act in real time, the single-player tactical pause is replaced by a 50 percent slow-mo that both players experience simultaneously.

**Why this priority**: Co-op is the headline feature of the phase and the reason the simulation was built deterministic from day one. Every other Phase E item (invite links, accounts, PvP) either supports it or builds on the same infrastructure.

**Independent Test**: Two browsers on separate machines complete a full mission together, from launch through debrief, with both screens showing identical simulation state throughout and the outcome recorded in the host's campaign.

**Acceptance Scenarios**:

1. **Given** a host has started a co-op mission and a second player has joined, **When** both players issue orders to their own agents in the same moment, **Then** both orders take effect identically on both screens and the mission continues without divergence.
2. **Given** an active co-op mission, **When** either player triggers the pause control, **Then** the simulation runs at 50 percent speed for both players instead of freezing, and returns to full speed when released.
3. **Given** a co-op mission ends, **When** the debrief is shown, **Then** both players see the same results and the host's campaign state reflects them.
4. **Given** a player attempts to command an agent assigned to the other player, **Then** the command is not applied.

### User Story 2 - Drop-in via Shareable Link (Priority: P2)

A player who wants company copies an invite link and sends it to a friend over any channel. The friend clicks it, lands directly in the session lobby in their browser, and is playing within moments, without installing anything or creating an account first.

**Why this priority**: Frictionless joining is the browser platform's differentiator and the primary funnel into co-op. Co-op without an easy way in will not get used.

**Independent Test**: Player A generates a link, Player B opens it in a fresh browser with no prior game data, and both are in the same session lobby ready to launch a mission.

**Acceptance Scenarios**:

1. **Given** a host viewing the world map or mission brief, **When** they request an invite link, **Then** a shareable URL is produced that identifies their session.
2. **Given** a guest with no account and no saved data, **When** they open a valid invite link, **Then** they join the host's lobby without any sign-up step.
3. **Given** an invite link for a session that no longer exists, **When** it is opened, **Then** the guest sees a clear explanation and is offered single-player instead of an error page.

### User Story 3 - Accounts and Cloud Saves (Priority: P3)

A player creates an account (offered at first debrief, never forced at the door) and their campaign is saved to the cloud. They continue the same campaign on another device or browser, and if they play offline or decline an account, their progress still persists locally exactly as it does today.

**Why this priority**: Cloud identity protects player investment in a persistent campaign and is a prerequisite for PvP leaderboards, but the game remains fully playable without it, so it follows the co-op stories.

**Independent Test**: Create an account on device A mid-campaign, open the game on device B, sign in, and resume the identical campaign; then play a mission on B and confirm the change is visible back on A.

**Acceptance Scenarios**:

1. **Given** a guest player finishing their first mission, **When** the debrief is shown, **Then** they are invited (not required) to create an account, and declining loses nothing.
2. **Given** a signed-in player with a cloud save, **When** they sign in on a different device, **Then** their full campaign (territories, roster, research, arsenal, service records) is restored.
3. **Given** a signed-in player who goes offline mid-session, **When** they keep playing, **Then** progress is kept locally and synced to the cloud when connectivity returns.
4. **Given** a local guest campaign and a newly created account, **When** the account is created, **Then** the existing local campaign becomes the account's cloud save rather than being discarded.

### User Story 4 - Async PvP Against Defense Layouts (Priority: P4)

A signed-in player attacks a "ghost" of another player's defense layout: the defender's turret and trap placement from their own campaign, garrisoned by AI. The attack runs entirely offline from the defender's point of view. Results feed regional leaderboards so players can compete without real-time netcode.

**Why this priority**: It multiplies replay value from content that already exists (defense missions) and gives accounts a competitive reason to exist, but it depends on accounts and is the least foundational item of the phase.

**Independent Test**: Player A saves a defense layout, Player B browses available ghost layouts, attacks A's layout, and the result appears on the regional leaderboard, all without A being online.

**Acceptance Scenarios**:

1. **Given** a signed-in player with a defended territory, **When** their layout is published as a ghost, **Then** other players can attack a copy of it while the defender's real campaign is untouched.
2. **Given** an attacker completing a ghost assault, **When** the mission ends, **Then** the outcome updates the attacker's leaderboard standing in their region.
3. **Given** a player viewing leaderboards, **When** they select their region, **Then** they see standings scoped to that region.

### Edge Cases

- What happens when a co-op peer disconnects mid-mission (network drop, closed tab)? [NEEDS CLARIFICATION: disconnect handling has several reasonable shapes with different scope: pause and wait for rejoin, host absorbs control of the orphaned agents, or mission aborts without penalty]
- The two players' simulations are found to have diverged mid-mission: the session must detect this promptly and resolve it in a way both players understand, never silently continuing on split realities.
- Both players issue a command in the same instant, or one player's connection lags: late commands must apply at the same moment for both players or be rejected identically for both.
- A guest opens an invite link while a mission is already underway: they join for the next mission rather than mid-mission (drop-in is at mission boundaries).
- Cloud save and local save disagree (played offline on two devices): the player is shown both, with timestamps and campaign summary, and chooses; nothing is silently overwritten.
- A defender changes their layout while an attacker is mid-assault on the ghost: the attacker finishes against the copy they started with.
- Leaderboard abuse: repeated attacks on the same weak layout, or self-attack, must not farm unlimited standing.
- An invite link is reused after the session ended or forwarded to a third person when the session is full: the extra joiner is turned away with a clear message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support co-op missions for exactly 2 players, each controlling 2 agents of a shared 4-agent squad, with both players observing an identical mission state at all times.
- **FR-002**: The system MUST replace tactical pause with a shared 50 percent slow-mo in co-op; no player can unilaterally freeze the simulation.
- **FR-003**: The system MUST restrict each co-op player to commanding only their own assigned agents.
- **FR-004**: The system MUST detect simulation divergence between co-op peers during play and surface it to both players rather than allowing the session to continue diverged.
- **FR-005**: Hosts MUST be able to generate a shareable invite link, and guests MUST be able to join via that link with no account and no prior game data.
- **FR-006**: The system MUST prefer direct peer-to-peer connections between co-op players and fall back to a relayed connection when a direct connection cannot be established.
- **FR-007**: Co-op mission outcomes MUST be recorded in the host's campaign, and both players MUST see the same debrief.
- **FR-008**: Users MUST be able to create an account, offered no earlier than the first debrief, and MUST be able to keep playing indefinitely without one.
- **FR-009**: The system MUST sync a signed-in player's full campaign state to the cloud and restore it on any device they sign in on.
- **FR-010**: The system MUST persist progress locally when offline or signed out, sync when connectivity returns, and adopt an existing local campaign into a newly created account.
- **FR-011**: The system MUST resolve conflicting cloud and local saves by presenting both to the player for an explicit choice, never by silent overwrite.
- **FR-012**: Signed-in players' defense layouts MUST be publishable as ghost copies that other players can attack asynchronously, with no effect on the defender's live campaign.
- **FR-013**: Ghost assault outcomes MUST update regional leaderboards, and the scoring MUST resist farming (repeat attacks on the same layout, self-attack).
- **FR-014**: Async PvP attacks MUST affect the attacker's campaign resources per [NEEDS CLARIFICATION: whether ghost assaults risk/reward real campaign assets (agent injury, ammo, loot) or run as a consequence-free arcade mode feeding only the leaderboard]

### Key Entities

- **Account**: A player identity; owns one cloud save per campaign slot, a regional leaderboard standing, and published ghost layouts. Optional; guests have none.
- **Cloud Save**: The complete persistent campaign (territories, roster, research, arsenal, credits, service records) tied to an account, with enough metadata (timestamp, campaign summary) to support conflict resolution against a local save.
- **Co-op Session**: A transient pairing of a host and one guest, addressable by invite link, spanning a lobby and one or more missions; owns the agent-to-player assignment.
- **Ghost Layout**: An immutable snapshot of a player's defense placement and its garrison, attackable by others; references its owning account and territory but never writes back to them.
- **Leaderboard**: Regional ranking of accounts by async PvP performance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A guest clicking an invite link on a fresh browser reaches the host's lobby in under 30 seconds, with zero installation or sign-up steps.
- **SC-002**: 99 percent of co-op missions complete without divergence between the two players' views; every divergence that does occur is detected and surfaced within 5 seconds.
- **SC-003**: Co-op play feels responsive: player commands take visible effect within 200 milliseconds on typical home connections.
- **SC-004**: A campaign saved on one device is playable on a second device within 60 seconds of signing in.
- **SC-005**: Zero reported cases of lost campaign progress from save sync (offline play, device switches, account adoption of a local save).
- **SC-006**: At least 30 percent of players who finish a co-op mission as a guest go on to create an account.
- **SC-007**: A player can find, attack, and complete a ghost assault, and see their leaderboard standing update, in a single sitting of under 15 minutes.

## Assumptions

- The existing deterministic simulation, command-stream replay, and state-hash verification are reused as the synchronization and desync-detection foundation; this phase adds transport and identity, not a new simulation model.
- Co-op is capped at 2 players and 2 agents each; larger squads and real-time PvP are explicitly out of scope at launch per the design doc.
- Drop-in joining happens at mission boundaries (lobby, brief), not mid-mission.
- The campaign in co-op belongs to the host; the guest participates without their own campaign advancing (guests may have no campaign at all).
- Async PvP ghost layouts come from the existing defense mission placement system (Phase B); no new placement editor is needed.
- Local persistence continues to work fully offline and remains the storage of record for guests; cloud storage augments rather than replaces it, though the local storage mechanism may need upgrading to hold larger synced saves.
- Regions for leaderboards are geographic player regions, assigned at account creation.
- Accounts require only a minimal credential (such as an email); no social features, friends lists, or chat are in scope for this phase.
