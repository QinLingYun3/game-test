## ADDED Requirements

### Requirement: Difficulty default option renamed
The system SHALL display "Campaign" (or localized equivalent) instead of "Default" for the default difficulty option.

#### Scenario: Chinese locale shows correct text
- **WHEN** the user is on the home screen with Chinese language selected
- **THEN** the default difficulty option SHALL display "闯关"

#### Scenario: English locale shows correct text
- **WHEN** the user is on the home screen with English language selected
- **THEN** the default difficulty option SHALL display "Campaign"

#### Scenario: French locale shows correct text
- **WHEN** the user is on the home screen with French language selected
- **THEN** the default difficulty option SHALL display "Campagne"
