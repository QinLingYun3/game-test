## ADDED Requirements

### Requirement: Leaderboard supports time period filtering
The system SHALL support filtering leaderboard entries by time period: daily, weekly, monthly, or all-time.

#### Scenario: Daily leaderboard
- **WHEN** the client requests the leaderboard with period "daily"
- **THEN** the system SHALL return only entries submitted on the current calendar day (based on server local time)

#### Scenario: Weekly leaderboard
- **WHEN** the client requests the leaderboard with period "weekly"
- **THEN** the system SHALL return only entries submitted during the current week (Monday 00:00:00 to Sunday 23:59:59, based on server local time)

#### Scenario: Monthly leaderboard
- **WHEN** the client requests the leaderboard with period "monthly"
- **THEN** the system SHALL return only entries submitted during the current calendar month (1st day 00:00:00 to last day 23:59:59, based on server local time)

#### Scenario: All-time leaderboard (default)
- **WHEN** the client requests the leaderboard without specifying a period
- **THEN** the system SHALL return all entries sorted by score, identical to current behavior

### Requirement: Leaderboard UI displays time period tabs
The system SHALL display the leaderboard with tab navigation for switching between daily, weekly, monthly, and all-time views.

#### Scenario: Default tab is daily
- **WHEN** the leaderboard modal opens
- **THEN** the "daily" tab SHALL be active by default
- **AND** the daily leaderboard entries SHALL be displayed

#### Scenario: Switching tabs
- **WHEN** the user clicks a different time period tab
- **THEN** the system SHALL request the corresponding leaderboard data
- **AND** the leaderboard list SHALL update to show entries for the selected period

#### Scenario: Empty period leaderboard
- **WHEN** a time period has no entries
- **THEN** the system SHALL display an empty state message

### Requirement: Leaderboard API accepts period parameter
The system SHALL accept a `period` parameter in the `get_leaderboard` WebSocket message.

#### Scenario: Valid period parameter
- **WHEN** the client sends `get_leaderboard` with `period: "daily"`
- **THEN** the server SHALL respond with `leaderboard_state` containing only daily entries

#### Scenario: Invalid period parameter
- **WHEN** the client sends `get_leaderboard` with an invalid `period` value
- **THEN** the server SHALL fall back to "all" (all-time) behavior
