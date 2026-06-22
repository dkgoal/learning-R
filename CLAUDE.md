# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This is a new, essentially empty repository (`learning-R`) intended for learning R. At present it contains only `README.md` — there is no R source code, package structure, build tooling, or test suite yet.

As the repository grows, update this file with:

- **Common commands** — how to run scripts (e.g. `Rscript path/to/script.R`), start an interactive session (`R`), run tests, and lint, once those tools are introduced.
- **Architecture** — the big-picture structure (e.g. an R package layout with `R/`, `man/`, `tests/`, and `DESCRIPTION`, or a collection of standalone learning scripts/notebooks) once it takes shape.

## Conventions for R work in this repo

- If this becomes an R package, the standard layout applies: `R/` for source, `man/` for generated docs, `tests/testthat/` for tests, and a `DESCRIPTION` file declaring metadata and dependencies.
- Common R tooling to reach for when needed: `testthat` for tests (`testthat::test_file("tests/testthat/test-x.R")` for a single file), `devtools`/`usethis` for package development (`devtools::test()`, `devtools::check()`), `lintr` for linting, and `roxygen2` for documentation.
