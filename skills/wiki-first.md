# wiki-first

Before implementing any business logic, look up the relevant documentation, wiki pages, or ADRs. Business rules change; code should reflect the current authoritative source, not assumptions.

## Rules

**Before writing business logic**, search for:
1. Wiki pages or Confluence docs covering the domain (payments, auth, notifications, etc.)
2. ADRs in `docs/adr/` that govern the relevant pattern or technology choice
3. Existing service or module READMEs that describe current behavior
4. OpenAPI/Swagger specs for API contracts

**When documentation is found**:
- Implement against the documented contract, not inferred behavior
- If code and documentation conflict, surface the conflict as `NEEDS_REVIEW` — do not silently follow either

**When documentation is absent**:
- Note the gap in the Handoff block
- Implement the most conservative interpretation
- Flag for documentation as a follow-up

## What counts as business logic

- Validation rules, eligibility conditions, pricing calculations
- Workflow state transitions
- Authorization / permission checks
- External API contracts and data formats
- Error codes and user-facing messages

## What does NOT require a lookup

- Utility functions, string formatting, pure data transformations
- Infrastructure plumbing (DB connections, HTTP middleware configuration)
- Internal tooling with no documented contract
