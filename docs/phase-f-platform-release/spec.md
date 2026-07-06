# Feature Specification: Platform, Distribution, and Release

**Created**: 2026-07-05

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant First Play (Priority: P1)

A curious visitor clicks a link to the game and is playing the first mission moments later, directly from the landing page: no download page, no installer, no account wall, no long loading bar. Deeper content (later districts, higher-fidelity assets) arrives in the background while they play, and account creation is not mentioned until their first debrief.

**Why this priority**: The browser's zero-friction start is the whole acquisition funnel; every other Phase F feature only matters to players who got past the first load. It also enforces the load budget that all future content must fit inside.

**Independent Test**: On a clean browser over a typical home connection, navigate to the landing page and reach playable control of the first mission; measure elapsed time and data transferred, and verify no sign-up or install step occurred.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on the landing page, **When** they choose to play, **Then** the first mission reaches playable control after a small initial download, with no account or installation step.
2. **Given** a player in their first mission, **When** later-needed content streams in the background, **Then** gameplay never stutters or blocks on that streaming.
3. **Given** a player finishing their first mission, **When** the debrief appears, **Then** this is the first moment account creation is offered.
4. **Given** a player on a slow connection, **When** the initial download is still in progress, **Then** they see meaningful progress feedback rather than a blank page.

### User Story 2 - Premium Unlock After Free Act 1 (Priority: P2)

A player finishes the free opening arc of the campaign and hits a single, clearly framed decision: buy the full game once and continue their exact campaign, or stop. There are no microtransactions, no consumables, and no drip pricing. A player who buys on one device keeps their entitlement everywhere they sign in.

**Why this priority**: This is the business model of the release; nothing ships commercially without it. It sits below instant first play because the funnel must exist before conversion matters.

**Independent Test**: Play a free campaign to the paywall boundary, complete a purchase, and verify the same campaign continues seamlessly; sign in on a second device and verify the entitlement is honored there.

**Acceptance Scenarios**:

1. **Given** a free player reaching the end of the free arc, **When** they attempt to progress further, **Then** they are shown a single one-time purchase offer, and everything they have already earned remains playable if they decline.
2. **Given** a player completing a purchase, **When** they return to the world map, **Then** the full campaign is unlocked and their in-progress campaign state is unchanged.
3. **Given** a premium player signing in on a new device, **When** their campaign loads, **Then** the premium entitlement is restored without repurchase.
4. **Given** any screen in the game, **Then** no purchasable item other than the single premium unlock is ever offered.

### User Story 3 - Tablet Touch Play (Priority: P3)

A tablet player plays the full game with touch alone: tap to select and command agents, two-finger gestures to move and rotate the camera, and touch-sized equivalents for every keyboard action (stims, Persuadertron, swarm orders, equipment). Phones are explicitly out of scope.

**Why this priority**: Touch opens an entire device class the browser already reaches and is the riskiest input work (called out in the design risk register), so it should land before release polish items.

**Independent Test**: Complete a full mission of each type on a tablet using only touch, including at least one use of every command category (movement, attack, stims, Persuadertron, swarm orders, equipment, camera, sim speed).

**Acceptance Scenarios**:

1. **Given** a tablet player in a mission, **When** they tap a walkable location with agents selected, **Then** the agents move there, and equivalent touch affordances exist for attack, stims, Persuadertron, swarm orders, and equipment.
2. **Given** a tablet player, **When** they use two-finger gestures, **Then** the camera pans, rotates in its 45 degree steps, and zooms.
3. **Given** a phone-sized screen, **When** the game loads, **Then** the player is told the experience is designed for tablets and desktops rather than being left with an unusable layout.

### User Story 4 - Control Remapping and Gamepad (Priority: P4)

A keyboard player rebinds any action to the keys they prefer, and a couch player completes the whole game on a gamepad. Bindings persist between sessions.

**Why this priority**: Valuable comfort and reach features, but the existing keyboard and mouse controls already serve the core audience, so this follows the new-device-class work.

**Independent Test**: Rebind several actions, verify they work and survive a reload, then complete a full mission using only a gamepad.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** a player rebinds an action to a new key, **Then** the new binding takes effect immediately, persists across sessions, and any conflict with an existing binding is surfaced before it is saved.
2. **Given** a player with a connected gamepad, **When** they play a mission, **Then** every action available on keyboard and mouse is reachable from the gamepad, including selection, movement, attack, and all ability keys.
3. **Given** a remapped configuration, **When** the player chooses reset to defaults, **Then** the shipped bindings are restored.
4. **Given** a gamepad disconnecting mid-mission, **Then** keyboard and mouse input continues to work without interruption.

### User Story 5 - Accessibility Completion (Priority: P5)

A deaf or hard-of-hearing player gets captions for every gameplay-relevant sound, not just mission dialogue, and colorblind players get palettes verified across every screen and in-mission element in a final audit.

**Why this priority**: This is completion and audit work on top of already-shipped accessibility features (colorblind palettes, comms-text subtitles, sim speed slider); it must be done before release but builds on existing systems.

**Independent Test**: Play a mission with sound muted and captions on, and verify every gameplay-relevant audio cue (gunfire direction, alarm changes, Persuadertron, explosions) has a visible equivalent; run the colorblind audit checklist across all screens in all three palettes.

**Acceptance Scenarios**:

1. **Given** captions enabled and audio muted, **When** an alarm tier changes, an explosion occurs, or an off-screen firefight starts, **Then** a caption or visual indicator conveys the event.
2. **Given** each of the three palette options, **When** any screen or mission scene is displayed, **Then** no information is conveyed by color alone and all faction/state colors remain distinguishable, verified by a recorded audit.

### Edge Cases

- What happens when a purchase is interrupted (connection drop, closed tab) after payment succeeds but before the game records it? The entitlement must be recoverable without support intervention.
- A free player receives a co-op invite from a premium host into content beyond the free arc: joining as a guest is the expected behavior, and it must not grant permanent unlock.
- A player hits the paywall boundary mid-session with a mission already in progress: the current mission completes and pays out normally; only further progression gates.
- Background streaming fails mid-session (connection loss): already-loaded content keeps playing, and the game retries rather than crashing or corrupting.
- A player rebinds every key including the rebind/settings access itself: settings must always remain reachable.
- Touch and gamepad both active (tablet with controller): the last-used input drives UI hints, and neither is locked out.
- A refunded purchase: the entitlement is revoked but the campaign save is preserved so a later repurchase resumes it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The first mission MUST be reachable directly from the landing page with no installation, sign-up, or account step, with account creation offered no earlier than the first debrief.
- **FR-002**: The initial download required to reach playable control of the first mission MUST stay within the 15 MB budget, and the total content for any full mission MUST stay within 60 MB.
- **FR-003**: Content beyond the immediate need MUST load in the background without interrupting or degrading active play.
- **FR-004**: The game MUST offer exactly one purchasable product: a one-time premium unlock granting the full campaign, with no other purchases of any kind.
- **FR-005**: Free players MUST be able to play the opening campaign arc in full and retain access to everything they earned there after declining to purchase. The free arc ends at [NEEDS CLARIFICATION: the design doc equates "free Act 1" with 3 territories, but Act 1 spans territories 1 to 10; is the boundary 3 territories or the act boundary?]
- **FR-006**: Premium entitlement MUST persist across devices for signed-in players and MUST be recoverable after an interrupted purchase.
- **FR-007**: Purchasing MUST NOT reset, alter, or restart the player's in-progress campaign.
- **FR-008**: Players MUST be able to remap every keyboard-bound action, with conflicts surfaced, persistence across sessions, and a reset to defaults.
- **FR-009**: The full game MUST be completable using only a gamepad, and separately using only touch on a tablet, with every command category available on each input method.
- **FR-010**: Tablet touch MUST provide tap-based selection and commands plus two-finger camera pan, rotate, and zoom; phone-sized devices MUST receive a clear unsupported-experience message.
- **FR-011**: Every gameplay-relevant audio cue MUST have a caption or visual equivalent when captions are enabled.
- **FR-012**: All screens and in-mission visuals MUST pass a colorblind audit in each of the three shipped palettes, with the audit results recorded.
- **FR-013**: The premium offer price MUST be [NEEDS CLARIFICATION: price point and whether regional pricing applies; business decision with no stated default]

### Key Entities

- **Premium Entitlement**: The record that an account owns the full game; grants campaign progression beyond the free arc on every device the account signs into, revocable on refund without destroying the campaign save.
- **Control Binding Profile**: A player's persisted mapping of actions to keys and gamepad inputs, resettable to shipped defaults.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor on a typical home broadband connection reaches playable control of the first mission in under 15 seconds from clicking play.
- **SC-002**: The initial playable download is at most 15 MB and no single mission requires more than 60 MB of content in total.
- **SC-003**: A player can complete the purchase flow, from paywall screen to unlocked campaign, in under 2 minutes.
- **SC-004**: 100 percent of interrupted purchases resolve to a granted entitlement without a support ticket.
- **SC-005**: Full campaign completion is demonstrated three ways: keyboard and mouse only, gamepad only, and tablet touch only.
- **SC-006**: With audio muted and captions on, a tester can correctly identify alarm state changes and the direction of off-screen combat in 95 percent of trials.
- **SC-007**: The colorblind audit covers every screen and mission element in all three palettes with zero unresolved failures at release.

## Assumptions

- Phone support is deferred per the design risk register; tablet is the touch target for this release.
- The command-driven input architecture already isolates gameplay from input devices, so remapping, gamepad, and touch are bindings and UI work, not gameplay changes.
- Account and cloud save infrastructure from Phase E exists; premium entitlement rides on it, and guests who purchase create an account as part of checkout so the entitlement is durable.
- Free players can join premium hosts' co-op sessions as guests without gaining a persistent unlock.
- Payment processing is handled by an established third-party provider; the game records only entitlement status, no payment details.
- The existing comms-text subtitle system covers dialogue; the caption work in this phase extends coverage to non-speech gameplay audio.
- The 15 MB and 60 MB figures are the fixed budgets from the design doc and are treated as release gates, not aspirations.
