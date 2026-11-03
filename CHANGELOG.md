# Changelog

All notable changes to Storage Tags will be documented in this file.

The project follows Semantic Versioning. Release tags are created only after the corresponding pull request has passed tests, been reviewed, and merged.

## [0.0.1] - Unreleased

### Added

- Unified tag domain for NFC and RAIN/UHF identities.
- Product/capability catalog for generic NFC and RAIN tags, NXP NTAG 223/224 DNA, StatusDetect, NTAG 424 DNA/TagTamper, Identiv DNA product families, NXP UCODE DNA/Track, and UCODE Guard.
- Mixed-tag inventory sessions so an item can carry both UHF and NFC identities.
- Immutable tag security/status events in addition to aggregated inventory observations.
- Self-hosted NTAG 22x DNA SUN verification with StatusDetect decoding.
- Self-hosted NTAG 424 DNA SDM verification with replay-counter tracking.
- Current and permanent/once-opened tamper state tracking.
- Security profiles that reference mounted secret keys without storing key material in application data.
- Reader-bridge abstraction for authenticated USB NFC and RAIN readers.
- Automated cryptographic tests and GitHub Actions test/build gate.

### Changed

- Replaced the EPC-first application model with technology-aware tag identifiers.
- Reset the development version baseline to `0.0.1`.
- Kept `/api/rfid/browser-read` only as a compatibility adapter over the generic observation pipeline.

### Security

- AES keys are resolved server-side from configured secret storage and are not exposed by REST/UI/MCP surfaces.
- SUN/SDM counters are tracked to distinguish a valid fresh message from a replayed valid message.
