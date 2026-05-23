# scope-guard

Every change must stay inside the authorized file perimeter. Scope creep introduces unintended side effects, makes reviews harder, and violates the human-as-gate model.

## Rules

**Before touching any file**, confirm it is within the authorized scope defined in the current brief or command invocation. The authorized perimeter is:
- Paths explicitly listed in the implementation brief
- Files logically required to make the listed paths work (imports, test files for modified files)

**Never touch**:
- Configuration files not listed in scope (`*.env`, `appsettings.*.json`, CI/CD pipelines, `package.json` scripts block) unless explicitly authorized
- Files in other repositories or services
- Shared libraries or packages without explicit authorization and an impact analysis
- Build artifacts, lock files, or generated files unless a direct dependency requires it

## On scope ambiguity

If a necessary change falls outside the authorized perimeter:
1. Do NOT make the change silently
2. Surface it as a `NEEDS_REVIEW` with a clear explanation of why the out-of-scope file is needed
3. Let the human extend the scope explicitly

## Checklist before committing

- [ ] Every modified file is in the authorized scope
- [ ] No config or infrastructure files changed without explicit authorization
- [ ] No changes to shared code without impact analysis
