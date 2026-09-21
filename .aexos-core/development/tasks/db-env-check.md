# Task: DB Env Check

**Purpose**: Validate environment for DB operations without leaking secrets

**Elicit**: false

---

## Execution Modes

**Choose your execution mode:**

### 1. YOLO Mode - Fast, Autonomous (0-1 prompts)
- Autonomous decision making with logging
- Minimal user interaction
- **Best for:** Simple, deterministic tasks

### 2. Interactive Mode - Balanced, Educational (5-10 prompts) **[DEFAULT]**
- Explicit decision checkpoints
- Educational explanations
- **Best for:** Learning, complex decisions

### 3. Pre-Flight Planning - Comprehensive Upfront Planning
- Task analysis phase (identify all ambiguities)
- Zero ambiguity execution
- **Best for:** Ambiguous requirements, critical work

**Parameter:** `mode` (optional, default: `interactive`)

---

## Task Definition (AEXOS Task Format V1.0)

```yaml
task: dbEnvCheck()
owner: Ceres (Sage)
owner_type: agent
atomic_layer: Strategy

**Input:**
- field: query
  type: string
  source: User Input
  required: true
  validation: Valid SQL query

- field: params
  type: object
  source: User Input
  required: false
  validation: Query parameters

- field: connection
  type: object
  source: config
  required: true
  validation: Valid PostgreSQL connection via Supabase

**Output:**
- field: query_result
  type: array
  destination: Memory
  persisted: false

- field: records_affected
  type: number
  destination: Return value
  persisted: false

- field: execution_time
  type: number
  destination: Memory
  persisted: false
```

---

## Pre-Conditions

**Purpose:** Validate prerequisites BEFORE task execution (blocking)

**Checklist:**

```yaml
pre-conditions:
  - [ ] Database connection established; query syntax valid
    type: pre-condition
    blocker: true
    validation: |
      Check database connection established; query syntax valid
    error_message: "Pre-condition failed: Database connection established; query syntax valid"
```

---

## Post-Conditions

**Purpose:** Validate execution success AFTER task completes

**Checklist:**

```yaml
post-conditions:
  - [ ] Query executed; results returned; transaction committed
    type: post-condition
    blocker: true
    validation: |
      Verify query executed; results returned; transaction committed
    error_message: "Post-condition failed: Query executed; results returned; transaction committed"
```

---

## Acceptance Criteria

**Purpose:** Definitive pass/fail criteria for task completion

**Checklist:**

```yaml
acceptance-criteria:
  - [ ] Data persisted correctly; constraints respected; no orphaned data
    type: acceptance-criterion
    blocker: true
    validation: |
      Assert data persisted correctly; constraints respected; no orphaned data
    error_message: "Acceptance criterion not met: Data persisted correctly; constraints respected; no orphaned data"
```

---

## Tools

**External/shared resources used by this task:**

- **Tool:** configured PostgreSQL/Supabase tooling
  - **Purpose:** PostgreSQL connection, SQL execution, and dump/restore operations required by the substantive steps
  - **Source:** External prerequisites: the task-specific `psql`, `pg_dump`, Supabase CLI, or configured client explicitly invoked below

- **Validation binding:** configured database tooling
  - **Purpose:** Validate the task's query or migration using the target database's own parser, dry-run, transaction, or explain facilities as required by the substantive steps.
  - **Availability:** `.aexos-core/utils/db-query-validator.js` is not distributed; database access, credentials, and the task-specific client/CLI are external prerequisites.

---

## Scripts

**Agent-specific code for this task:**

- **Execution:** Host-guided through the configured database client or CLI required by this task.
  - **Unavailable wrapper:** `.aexos-core/scripts/db-query.js` is not distributed.
  - **Requirement:** Keep the declared validation, transaction, rollback, and result-readback gates; absence of configured database access blocks completion.

---

## Error Handling

**Strategy:** retry

**Common Errors:**

1. **Error:** Connection Failed
   - **Cause:** Unable to connect to the configured PostgreSQL/Supabase target
   - **Resolution:** Check connection string, credentials, network
   - **Recovery:** Retry with exponential backoff (max 3 attempts)

2. **Error:** Query Syntax Error
   - **Cause:** Invalid PostgreSQL SQL syntax
   - **Resolution:** Validate SQL with the configured PostgreSQL parser, transaction, dry-run, or explain step before execution
   - **Recovery:** Return the real PostgreSQL error and do not apply unvalidated SQL

3. **Error:** Transaction Rollback
   - **Cause:** Query violates constraints or timeout
   - **Resolution:** Review query logic and constraints
   - **Recovery:** Automatic rollback, preserve data integrity

---

## Performance

**Expected Metrics:**

```yaml
duration_expected: 5-20 min (estimated)
cost_estimated: $0.003-0.015
token_usage: ~2,000-8,000 tokens
```

**Optimization Notes:**
- Iterative analysis with depth limits; cache intermediate results; batch similar operations

---

## Metadata

```yaml
story: N/A
version: 1.0.0
dependencies:
  - N/A
tags:
  - database
  - infrastructure
updated_at: 2025-11-17
```

---


## Steps

### 1. Validate Required Environment Variables

```bash
test -n "$SUPABASE_DB_URL" || { echo "❌ Missing SUPABASE_DB_URL"; exit 1; }
echo "✓ SUPABASE_DB_URL present (redacted)"
```

### 2. Check SSL Mode and Pooler

```bash
case "$SUPABASE_DB_URL" in
  *"sslmode="*) echo "✓ sslmode present";;
  *) echo "⚠️ Consider adding sslmode=require";;
esac

echo "$SUPABASE_DB_URL" | grep -q "pooler" && echo "✓ Using pooler" || echo "⚠️ Consider pooler host"
```

### 3. Check Client Versions

```bash
psql --version || { echo "❌ psql missing"; exit 1; }
pg_dump --version || { echo "❌ pg_dump missing"; exit 1; }
echo "✓ PostgreSQL client tools available"
```

### 4. Check Server Connectivity

```bash
PSQL="psql \"$SUPABASE_DB_URL\" -v ON_ERROR_STOP=1 -t -c"
eval $PSQL "SELECT version();" > /dev/null && echo "✓ Database connection successful"
```

---

## Success Criteria

- All environment variables present
- PostgreSQL client tools installed
- Database connection successful
- SSL and pooler configuration validated

## Error Handling

If any check fails:
1. Show clear error message
2. Provide remediation steps
3. Exit with non-zero status
