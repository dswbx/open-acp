We want to build an agent orchestrator, similar to Conductor and Superset. It should communicate with agents using the ACP protocol (similar to Webstorm) so that we can put a nice UI on top of it instead of having them run inside the terminal.

Agent CLI's to support at least: Claude Code, Codex, Open Code

# Explore

- what's possible with the ACP protocol, what's the limitations, e.g. is can we fetch list of models and the context window, etc.

# Tech stack non-negotiables

- TypeScript, latest ESM
- [electrobun](https://github.com/blackboardsh/electrobun) as the runtime
- tailwind v4
- shadcn/ui with base-ui base

# Code style

- Prefer classes over functions.
- Filenames, If a file's main export is:
    - a class: use PascalCase.
    - one or more functions: use kebab-case.
    - an instance of a class: use kebab-case.
- use ".ts" imports over ".js" imports
- always add tests for new functionality
- prefer co-locating types instead of creating a separate `types.ts` file (if reasonable)