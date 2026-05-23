# Contributing

## Architecture rule

Commands invoke agents and scripts — they don't implement logic themselves. Logic lives in agents (reasoning) or scripts (data fetching, I/O). A command is a pipeline definition, not an implementation.

## Adding an agent

Create `agents/your-agent.md`. The file must define:

- A one-paragraph role description
- An **Input** section listing what it expects
- An **Output** section specifying the `### Status / ### Handoff` contract

Run `/sync-ai-tools` to deploy.

## Adding a command

Create `commands/your-command.md`. Specify:

- Which agents it chains, in what order
- How state is passed between them
