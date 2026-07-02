## ADDED Requirements

### Requirement: Level select label removed
The system SHALL display only the level select dropdown without a text label when a specific difficulty is selected.

#### Scenario: Dropdown visible without label
- **WHEN** the user selects a specific difficulty (not default)
- **THEN** the level select dropdown SHALL be visible
- **AND** no "Pick Level" text label SHALL be displayed

#### Scenario: Dropdown still functional
- **WHEN** the user interacts with the level select dropdown
- **THEN** the dropdown SHALL function normally
- **AND** level selection SHALL work as before
