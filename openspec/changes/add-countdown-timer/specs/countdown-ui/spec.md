## ADDED Requirements

### Requirement: Countdown card display
The system SHALL display a countdown card above the "removable pairs" card in the players panel during solo mode.

#### Scenario: Countdown card visible in solo mode
- **WHEN** the game is in solo mode and in "game" phase
- **THEN** a countdown card SHALL be displayed in the players panel
- **AND** the card SHALL show "剩余时间" on the left and the remaining seconds on the right

### Requirement: Countdown card styling
The system SHALL style the countdown card to match the existing "removable pairs" card style.

#### Scenario: Countdown card matches removable card style
- **WHEN** the countdown card is rendered
- **THEN** it SHALL use the same CSS classes and visual style as the removable pairs card

### Requirement: Color gradient based on remaining time
The system SHALL change the countdown card background color from bright orange to vivid red as time decreases.

#### Scenario: Full time shows orange
- **WHEN** the remaining time is at maximum
- **THEN** the card background SHALL be bright orange

#### Scenario: Low time shows red
- **WHEN** the remaining time approaches 0
- **THEN** the card background SHALL be vivid red

#### Scenario: Smooth color transition
- **WHEN** the remaining time decreases gradually
- **THEN** the background color SHALL transition smoothly between orange and red

### Requirement: Progress bar display
The system SHALL display a progress bar on the countdown card showing the proportion of remaining time.

#### Scenario: Progress bar reflects time left
- **WHEN** the countdown card is rendered
- **THEN** a progress bar SHALL be displayed showing `remaining / total` as a percentage

### Requirement: Low time warning animation
The system SHALL apply a flashing and pulsing animation to the countdown number when 10 seconds or less remain.

#### Scenario: 10 seconds or less triggers warning
- **WHEN** the remaining countdown is 10 or less
- **THEN** the countdown number SHALL flash and pulse with a CSS animation

#### Scenario: Warning animation stops when time increases
- **WHEN** the remaining countdown increases above 10 (e.g., via combo bonus)
- **THEN** the flashing and pulsing animation SHALL stop
