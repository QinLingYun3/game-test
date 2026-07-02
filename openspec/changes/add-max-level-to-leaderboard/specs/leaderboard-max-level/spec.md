## ADDED Requirements

### Requirement: Leaderboard records max level for campaign mode
The system SHALL record the maximum level reached when the player is in campaign mode (difficulty === "default").

#### Scenario: Campaign mode submits max level
- **WHEN** a player in campaign mode submits their score
- **THEN** the system SHALL store the current level index as `maxLevel` in the leaderboard entry

#### Scenario: Non-campaign mode does not record max level
- **WHEN** a player in Easy/Medium/Hard mode submits their score
- **THEN** the system SHALL store `null` for `maxLevel`

### Requirement: Max level only updates on new record
The system SHALL only update `maxLevel` if the new value is higher than the previously recorded value for the same session.

#### Scenario: Higher max level updates record
- **WHEN** a player submits a score with a higher `maxLevel` than before
- **THEN** the system SHALL update the `maxLevel` field

#### Scenario: Lower or equal max level does not update
- **WHEN** a player submits a score with a lower or equal `maxLevel` than before
- **THEN** the system SHALL NOT modify the existing `maxLevel`

### Requirement: Leaderboard UI displays max level
The system SHALL display the `maxLevel` field in the leaderboard UI when it is not null.

#### Scenario: Max level visible on leaderboard
- **WHEN** the leaderboard is displayed and an entry has a `maxLevel` value
- **THEN** the system SHALL show the max level alongside the score

#### Scenario: No max level shown for non-campaign entries
- **WHEN** the leaderboard is displayed and an entry has `maxLevel` as null
- **THEN** the system SHALL NOT show a max level indicator

### Requirement: Backward compatibility with existing leaderboard data
The system SHALL handle existing leaderboard entries that do not have a `maxLevel` field.

#### Scenario: Loading old leaderboard data
- **WHEN** the system loads persisted leaderboard data without `maxLevel`
- **THEN** the system SHALL treat missing `maxLevel` as `null` and not crash
