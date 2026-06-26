## ADDED Requirements

### Requirement: Server records finalized solo leaderboard entries
The system SHALL record a solo leaderboard entry on the server when a solo session is finalized by either successful completion of the run or by the player closing the page or leaving the solo game view before completion.

#### Scenario: Record completed solo run
- **WHEN** a solo player finishes the run and submits finalization for a valid solo session
- **THEN** the server records the player's avatar, nickname, score, and session identity as a leaderboard entry

#### Scenario: Record solo-view departure
- **WHEN** a solo player leaves the solo game view before completion and submits finalization for a valid solo session
- **THEN** the server records the player's avatar, nickname, score, and session identity as a leaderboard entry

#### Scenario: Record page close
- **WHEN** a solo player closes or refreshes the page before completion and the client can submit finalization for a valid solo session
- **THEN** the server records the player's avatar, nickname, score, and session identity as a leaderboard entry

#### Scenario: Same nickname across sessions remains distinct
- **WHEN** two finalized solo sessions submit the same nickname with different session identities
- **THEN** the server SHALL store them as two separate leaderboard entries

#### Scenario: Reject duplicate finalization for one session
- **WHEN** a finalized solo session is submitted more than once
- **THEN** the server SHALL only keep one leaderboard entry for that session

### Requirement: Home screen leaderboard shows top 20 solo runs
The system SHALL provide a leaderboard view from the home screen and SHALL show only the top 20 solo leaderboard entries ranked by score, using strict positional ordering without shared ranks or skipped numbers.

#### Scenario: Open leaderboard from home screen
- **WHEN** the player clicks the leaderboard link next to the how-to-play link on the home screen
- **THEN** the client opens a leaderboard view populated from server leaderboard data

#### Scenario: Limit leaderboard to top 20
- **WHEN** the leaderboard view is rendered
- **THEN** the client displays at most 20 ranked entries from the highest-scoring solo sessions

#### Scenario: Leaderboard entry fields are visible
- **WHEN** the leaderboard view shows an entry
- **THEN** the entry includes the player's avatar, nickname, score, and displayed rank

#### Scenario: Ties keep strict rank order
- **WHEN** two leaderboard entries have the same score
- **THEN** the leaderboard still assigns consecutive rank numbers in submission order without shared ranks or skipped positions

### Requirement: Solo results show leaderboard placement
The system SHALL return the finalized run's leaderboard rank and SHALL display that rank on the solo results screen alongside the final score.

#### Scenario: Completed run receives leaderboard rank
- **WHEN** a solo run is finalized after completion
- **THEN** the server responds with that run's leaderboard placement

#### Scenario: Results screen shows score and rank
- **WHEN** the solo results screen is shown for a finalized run
- **THEN** the client displays both the final score and the run's leaderboard rank
