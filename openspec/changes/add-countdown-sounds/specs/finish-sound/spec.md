## ADDED Requirements

### Requirement: Finish sound playback on game over
The system SHALL play a finish sound when the game transitions to the results phase.

#### Scenario: Finish sound plays when entering results
- **WHEN** the game phase transitions to "results"
- **THEN** the system SHALL play `finish.mp3` once

#### Scenario: Finish sound does not play on repeated results views
- **WHEN** the game phase is already "results" and does not change
- **THEN** the system SHALL NOT play the finish sound again

#### Scenario: Finish sound plays for all game over triggers
- **WHEN** the game ends due to countdown expiration, board clearance, or any other reason
- **AND** the phase transitions to "results"
- **THEN** the system SHALL play the finish sound

### Requirement: Finish sound preloading
The system SHALL preload the `finish.mp3` audio file using a lazy-loaded singleton pattern.

#### Scenario: Audio instance is reused
- **WHEN** multiple games are played in a single session
- **THEN** the system SHALL reuse the same Audio instance for the finish sound

#### Scenario: Playback failure is handled gracefully
- **WHEN** the browser blocks automatic audio playback
- **THEN** the system SHALL fail silently without affecting gameplay
