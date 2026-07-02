## ADDED Requirements

### Requirement: Countdown beep sound playback
The system SHALL play a beep sound every second when the solo mode countdown reaches 10 seconds or less.

#### Scenario: Beep plays on each tick during low countdown
- **WHEN** the solo mode countdown remaining is 10 or less and decreases by 1
- **THEN** the system SHALL play `beep_low.mp3` once

#### Scenario: Beep does not play above 10 seconds
- **WHEN** the solo mode countdown remaining is greater than 10
- **THEN** the system SHALL NOT play the beep sound

#### Scenario: Beep does not play repeatedly in the same second
- **WHEN** the countdown value has not changed since the last beep
- **THEN** the system SHALL NOT play the beep sound again

### Requirement: Countdown beep preloading
The system SHALL preload the `beep_low.mp3` audio file using a lazy-loaded singleton pattern.

#### Scenario: Audio instance is reused
- **WHEN** the beep sound is played multiple times during a game session
- **THEN** the system SHALL reuse the same Audio instance instead of creating a new one each time

#### Scenario: Playback failure is handled gracefully
- **WHEN** the browser blocks automatic audio playback
- **THEN** the system SHALL fail silently without affecting gameplay
