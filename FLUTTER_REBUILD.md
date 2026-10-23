# MeterGO — Flutter rebuild

This development branch is reserved for a new Flutter-based Android app, developed screen-by-screen from the owner's Figma designs.

## Product principles
- One Android app for both passengers and drivers.
- Fares must come from verified official government/governorate tariffs, with source and effective date.
- Users cannot edit official tariff amounts.
- If an official tariff is unavailable, do not invent or claim an official price.
- GPS distance, trip duration, and waiting time must be independently tested on real Android devices.
- The existing HTML/CSS/JavaScript prototype on `main` is preserved unchanged.

## Sequence
1. Splash screen and brand assets (awaiting final logo asset).
2. Home and vehicle choice / location state.
3. Tariff data model and verified sources.
4. Trip tracker and fare calculation.
5. Receipt and ride history.
6. Android testing, privacy requirements, and Google Play release checks.

The Flutter project scaffold and code will be added in subsequent commits. This document is a development plan, not a claim that a Flutter app is already built.
