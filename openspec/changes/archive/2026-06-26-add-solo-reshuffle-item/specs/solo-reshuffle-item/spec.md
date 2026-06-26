## ADDED Requirements

### Requirement: Solo player can use a reshuffle item
The system SHALL provide a solo-only reshuffle item with icon `🔄` that the player can trigger by double-clicking the item control during active gameplay.

#### Scenario: Reshuffle item is shown in solo mode
- **WHEN** a player starts or continues a solo run
- **THEN** the solo item UI SHALL include a reshuffle item with icon `🔄`

#### Scenario: Reshuffle item uses existing double-click interaction
- **WHEN** the player double-clicks the reshuffle item during an active solo board
- **THEN** the system SHALL apply the reshuffle effect to the current remaining tiles

### Requirement: Reshuffle item preserves run progress
The system SHALL reshuffle only the remaining tiles on the current solo board and MUST NOT restart the level, reset the room, or clear the player's score and progress.

#### Scenario: Reshuffle keeps current level state
- **WHEN** the player uses the reshuffle item in solo mode
- **THEN** the current level index, score, combo tracker, and other solo run state SHALL remain unchanged except for the board arrangement and derived move counts

### Requirement: Reshuffle output must remain solvable
The system SHALL guarantee that a reshuffled solo board contains at least one removable pair and MUST NOT create same-type stacked tiles within the same cell.

#### Scenario: Reshuffle never creates a dead board
- **WHEN** the reshuffle item resolves successfully
- **THEN** the resulting board SHALL contain at least one valid move

#### Scenario: Reshuffle never creates vertically stacked duplicates
- **WHEN** the reshuffle item resolves successfully
- **THEN** no cell in the resulting board SHALL contain two tiles of the same type in its stack

### Requirement: Reshuffle item copy is translated
The system SHALL provide translated label and description copy for the reshuffle item in every supported language.

#### Scenario: Player sees translated reshuffle item text
- **WHEN** the game renders solo item copy in Chinese, English, or French
- **THEN** the reshuffle item name and description SHALL use the active language
