<!--
  AEXOS localization provenance: adapted from https://github.com/SynkraAI/aiox-core/blob/4ef6530ff03b83aea953e4a426f95e012b8b70c5/docs/en/aiox-workflows/brownfield-service-workflow.md
  Upstream localized content retained under the MIT license: https://github.com/SynkraAI/aiox-core/blob/4ef6530ff03b83aea953e4a426f95e012b8b70c5/LICENSE
  Status: adapted for AEXOS identity and paths; not behaviorally verified.
-->
# Brownfield Service Workflow

> **EN** | [PT](../../aexos-workflows/brownfield-service-workflow.md) | [ES](../../es/aexos-workflows/brownfield-service-workflow.md)

---

**Full documentation available in:** [Portuguese Version](../../aexos-workflows/brownfield-service-workflow.md)

---

## Summary

The **Brownfield Service Workflow** is designed for evolving existing backend services and APIs. It focuses on:

- API versioning and backward compatibility
- Database migration strategies
- Service refactoring patterns
- Performance optimization
- Security enhancements

### When to Use

- Extending existing APIs with new endpoints
- Refactoring backend services
- Database schema evolution
- Performance improvements in services
- After completing brownfield-discovery

### Prerequisites

- Run `brownfield-discovery` first if unfamiliar with the project
- Understand existing API contracts

### Key Agents

- `@architect` - Service evolution strategy
- `@dev` - Backend implementation
- `@data-engineer` - Migration planning
- `@qa` - API contract testing

### Main Phases

1. **Contract Analysis** - Existing API review
2. **Migration Planning** - Data and API versioning strategy
3. **Implementation** - Service changes
4. **Data Migration** - Database updates
5. **Validation** - Contract and regression tests

---

*For complete details, diagrams, and step-by-step instructions, see the [Portuguese documentation](../../aexos-workflows/brownfield-service-workflow.md).*
