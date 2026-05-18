# RCT Randomization Tool

A local static website for generating RCT allocation schedules.

## Supported Methods

- Simple Randomization
- Block Randomization with 1 to 3 block-size options
- Stratified Randomization with up to 4 stratification variables
- Stratified Block Randomization with up to 4 stratification variables and 1 to 3 block-size options

## Usage

Open `index.html` directly in a browser.

## Features

- Custom sample size, participant ID prefix, seed, treatment arms, and allocation ratio
- Reproducible seeded randomization
- Up to 4 stratification variables, with comma-separated levels for each variable
- Editable sample size for each generated stratum
- Block-size validation against the allocation-ratio total; users may enter 1, 2, or 3 block-size options
- Copyable results table and CSV export
- Header branding for La Trobe University using `latrobe logo.png`, plus the Statistics Consultancy Platform image from `SCP logo.jpg`

## Important Note

Before using this tool for a real clinical trial, have the randomization plan, block sizes, seed handling, and allocation concealment process reviewed by the trial statistician and the study SOP.

For production deployment, confirm the La Trobe University logo file and Statistics Consultancy Platform image are approved for the intended use.
