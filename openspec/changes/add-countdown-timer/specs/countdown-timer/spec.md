## ADDED Requirements

### Requirement: Countdown initialization per level
The system SHALL initialize the countdown for each level based on the total tile count of that level.

#### Scenario: Level start countdown calculation
- **WHEN** a solo level starts
- **THEN** the total countdown SHALL be set to `totalTiles * 1.5` seconds

### Requirement: Countdown tick during gameplay
The system SHALL decrement the remaining countdown every second during active gameplay.

#### Scenario: Normal countdown decrement
- **WHEN** the game is in "game" phase and no blocking overlay is active
- **THEN** the remaining countdown SHALL decrease by 1 every second

#### Scenario: Countdown pause during shuffle
- **WHEN** a reshuffle is in progress (solo reshuffle pending or reshuffle countdown active)
- **THEN** the countdown SHALL pause and not decrement

#### Scenario: Countdown pause during start countdown
- **WHEN** the start countdown (3-2-1) is active
- **THEN** the countdown SHALL pause and not decrement

### Requirement: Game over on countdown expiration
The system SHALL end the game when the countdown reaches 0.

#### Scenario: Time runs out
- **WHEN** the remaining countdown reaches 0
- **THEN** the game phase SHALL transition to "results"
- **AND** the current score SHALL be preserved for the results screen

### Requirement: Combo time bonus
The system SHALL add 3 seconds to the remaining countdown for each combo achieved.

#### Scenario: Combo adds time
- **WHEN** a player achieves a combo (count >= 1)
- **THEN** 3 seconds SHALL be added to the remaining countdown

### Requirement: Cross-level time carryover
The system SHALL carry over remaining time to the next level instead of resetting.

#### Scenario: Time carries to next level
- **WHEN** a level is completed and the next level starts
- **THEN** the new remaining time SHALL be `previousRemaining + newLevelTotal`

### Requirement: Quick match time penalty
The system SHALL reduce the remaining countdown by 4 seconds when quick match is used in solo mode.

#### Scenario: Quick match reduces time
- **WHEN** a player uses the quick match item in solo mode
- **THEN** the remaining countdown SHALL be reduced by 4 seconds
- **AND** the countdown SHALL not go below 0

### Requirement: Reshuffle time behavior
The system SHALL pause the countdown during reshuffle operations in solo mode.

#### Scenario: Reshuffle pauses countdown
- **WHEN** a reshuffle is triggered in solo mode
- **THEN** the countdown SHALL pause for the duration of the reshuffle
- **AND** the countdown SHALL resume after the reshuffle completes
