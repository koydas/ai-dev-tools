# /token-audit

Audit Claude Code token usage — trends, model breakdown, and command adoption.

## Steps

1. Determine the audit window:
   - If an argument is provided (`$ARGUMENTS`), use it as the number of days to look back (default: 30)
2. Run the audit script: `node scripts/token-audit.mjs --days $ARGUMENTS`
3. Present the report to the user:
   - Total tokens consumed (input / output / cache)
   - Daily trend (tokens per day over the window)
   - Model breakdown (which models were used and in what proportion)
   - Top commands by token consumption
   - Sessions with unusually high usage
4. Surface any notable patterns or outliers
