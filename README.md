# puppeye

UI testing with eyes. 👀

**Work in progress, proof of concept.**

## Motivation

Current UI testing tools still rely heavily on the UI implementation,
especially on DOM/CSS selectors to find the necessary elements on the page.

## Goal

Develop a UI testing tool that:

* enables making UI tests that do not rely on DOM/CSS selectors or DOM structure (XPath)
* enables describing UI flows as tasks that a user has to perform
* uses the same inputs as a human would (mouse, mouse wheel, touchscreen, keyboard)
* analyzes page elements and relations between them visually, based on how they are rendered

## Future

* record performed actions into an event log
* automatically decide when to screenshot
* integrate into Cypress
* build tests by converting from actual user recordings
