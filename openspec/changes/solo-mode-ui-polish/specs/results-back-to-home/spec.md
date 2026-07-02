## ADDED Requirements

### Requirement: Results page back to home button
The system SHALL display a "Back to Home" button on the results page next to the "Play Again" button in solo mode.

#### Scenario: Button is visible on solo results
- **WHEN** the game ends and the results screen is shown in solo mode
- **THEN** a "Back to Home" button SHALL be displayed next to the "Play Again" button

#### Scenario: Clicking button returns to home
- **WHEN** the user clicks the "Back to Home" button
- **THEN** the system SHALL return to the home screen
- **AND** the current room state SHALL be cleared
