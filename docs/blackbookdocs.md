# UCS CRM — Complete Black Book Documentation System

## Role

Act as a Senior Software Architect, Technical Documentation Engineer, Database Architect, QA Engineer, and UI/UX Designer.

Your task is to analyze the existing UCS CRM repository and create a complete, professional, black-book-style project documentation system, organized panel-wise, module-wise, and technically.

The documentation must be based on the actual implementation of the project. Do not invent modules, APIs, database tables, business rules, technologies, or functionality.

## 1. First: Analyze the Entire Project

Before creating documentation, inspect the repository thoroughly.

1. Identify all frontend and backend applications.
2. Identify every panel, dashboard, user role, module, and submodule.
3. Inspect routing, layouts, components, forms, modals, tables, and navigation.
4. Inspect controllers, routes, services, middleware, models, schemas, migrations, and configuration.
5. Read package.json and lockfiles to identify actual libraries and their versions.
6. Identify authentication, authorization, permissions, validations, and error-handling mechanisms.
7. Trace frontend actions through APIs to backend logic and database operations.
8. Inspect environment variable names without exposing their secret values.
9. Identify background jobs, scheduled tasks, file uploads, external integrations, and notification systems where applicable.
10. Identify existing documentation and preserve useful information.

Create an initial inventory at:

docs/00-Project-Overview/PROJECT-INVENTORY.md

Include:
- Repository structure.
- Applications and technology stack.
- Discovered panels and user roles.
- Modules and submodules.
- Database technologies.
- API structure.
- External integrations.
- Documentation coverage status.
- Unknowns and areas requiring manual verification.

Do not assume that a panel or feature exists simply because it is common in CRM applications.

## 2. Documentation Folder Structure

Create a well-organized documentation repository:

docs/
  README.md
  00-Project-Overview/
  01-Requirements/
  02-System-Architecture/
  03-Panel-Documentation/
  04-Module-Workflows/
  05-Database-Documentation/
  06-API-Reference/
  07-Business-Logic/
  08-Libraries-and-Technologies/
  09-Testing-and-QA/
  10-Security/
  11-Deployment-and-Setup/
  12-Troubleshooting/
  13-User-Manual/
  14-Glossary/
  15-Change-History/
  diagrams/
  assets/

Adjust this structure to fit the actual repository. Do not create empty filler documents merely to complete the folder list.

## 3. Project Overview

Document:
- Project introduction.
- Problem statement.
- Objectives.
- Scope and limitations.
- Functional requirements.
- Non-functional requirements.
- User roles and responsibilities.
- Major modules.
- Technology stack.
- High-level architecture.
- System dependencies.
- Key assumptions and constraints.

Create a project overview diagram and a module relationship diagram.

## 4. Panel-Wise Documentation

Create a separate documentation folder for every discovered panel.

For example:

docs/03-Panel-Documentation/
  Authentication/
  Admin-Panel/
  Other-Discovered-Panels/

Use the actual panel names found in the codebase.

For every panel, create the following documents wherever applicable:

### A. Panel Overview
- Purpose of the panel.
- Target users.
- Responsibilities and permissions.
- Main navigation and screens.
- Relationship with other panels.

### B. Screen and UI Documentation
- Page and screen names.
- Tables and columns.
- Forms, fields, dropdowns, filters, and search.
- Buttons and actions.
- Modals, drawers, tabs, and status indicators.
- Validation rules.
- Loading, empty, success, and error states.
- Responsive behavior, where implemented.

### C. Feature Documentation
For each feature, explain:
- What it does.
- Why it exists.
- How the user accesses it.
- Step-by-step operation.
- Input and output.
- Permissions required.
- Validation and business rules.
- Success and failure scenarios.
- Related APIs and database tables.

### D. Technical Implementation
- Frontend component paths.
- Backend route and controller paths.
- Service and utility functions.
- Middleware and permission checks.
- Database models and relationships.
- API request and response formats.
- Data transformation and calculations.
- Error handling.
- Dependencies on other modules.

### E. Business Logic
Explain the actual implemented logic step by step.

For important functions, include:
- Function name and file path.
- Purpose.
- Parameters and return values.
- Preconditions.
- Processing steps.
- Conditional branches.
- Calculations and formulas.
- Database changes.
- Side effects.
- Exceptions and edge cases.
- Related tests.

Use readable pseudocode or small, relevant code excerpts when helpful. Do not copy entire source files into the documentation.

### F. Panel Summary
- Features covered.
- APIs covered.
- Database entities covered.
- Security considerations.
- Known limitations.
- Testing status.
- Related documentation links.

## 5. Flow Diagrams

Use Mermaid diagrams in Markdown wherever appropriate.

Create:
- Overall system architecture.
- Frontend-to-backend request flow.
- Authentication and authorization flow.
- Panel navigation flow.
- Individual feature workflows.
- Business logic decision trees.
- Database entity relationship diagrams.
- API sequence diagrams.
- File upload and processing workflows.
- Notification and integration flows.
- Deployment architecture.

Choose the correct Mermaid diagram type: flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, or architecture diagram syntax supported by the project's documentation renderer.

Every diagram must:
- Have a descriptive title.
- Use meaningful node names.
- Represent the actual implementation.
- Show decision branches and failure paths when relevant.
- Include a short explanation.
- Link to the relevant source files and documentation.

Do not create diagrams that merely look impressive but do not explain real behavior.

## 6. Charts and Visual Analytics

Add useful charts to the documentation portal or reports where they improve understanding.

Recommended charts:
- Panels and modules inventory.
- Feature documentation coverage.
- API distribution by module.
- Database entities and relationship overview.
- Test coverage, if actual test results are available.
- Technology and dependency distribution.
- Implementation or documentation completion status.

Requirements:
- Use real, derived, or explicitly identified estimated data.
- Clearly distinguish estimated progress from verified progress.
- Do not invent performance metrics, test results, or business KPIs.
- Use appropriate charts: bar, donut, stacked bar, timeline, or dependency graph.
- Include labels, legends, explanations, and source methodology.
- Prefer static Mermaid diagrams or Markdown summaries when an interactive chart is unnecessary.

If creating an interactive documentation dashboard, use the libraries already available when practical. Avoid adding a large dependency solely for decorative charts.

## 7. Database Documentation

Document every discovered database and its relevant entities.

For each table or model, explain:
- Table/model name.
- Purpose.
- Fields and data types.
- Primary and foreign keys.
- Relationships and cardinality.
- Required and nullable fields.
- Defaults, indexes, unique constraints, and validation.
- Timestamps and soft-delete behavior, where applicable.
- Model hooks and associations.
- Migration history.
- Important queries and transactions.
- Data ownership and access restrictions.

Generate an ER diagram and a data dictionary.

Trace important workflows from frontend inputs through backend processing to database persistence.

Never expose actual production records, credentials, or sensitive personal data.

## 8. API Reference

Create a structured API reference grouped by panel and module.

For each discovered endpoint, include:
- HTTP method and route.
- Purpose.
- Source file.
- Authentication requirements.
- Authorization and permissions.
- Path parameters and query parameters.
- Request headers and body.
- Validation rules.
- Response structure.
- Status codes and error responses.
- Database operations.
- Related frontend callers.
- Example requests and sanitized example responses.

Use actual request and response structures from the code.

If useful, generate an OpenAPI specification, but only document endpoints that can be verified. Mark incomplete or inferred contracts clearly.

## 9. Libraries and Technologies

Create:

docs/08-Libraries-and-Technologies/TECHNOLOGY-STACK.md
docs/08-Libraries-and-Technologies/DEPENDENCY-REFERENCE.md

Include:
- Frontend technologies.
- Backend technologies.
- Programming languages.
- Frameworks.
- UI libraries.
- State management.
- Routing.
- Form validation.
- Authentication.
- Database and ORM.
- API clients.
- File processing.
- Charts and visualization.
- Testing tools.
- Build tools.
- Hosting and deployment technologies.
- External services.

For every important library, explain:
- Package name.
- Installed version from the lockfile.
- Purpose in this project.
- Actual usage locations.
- Relevant modules.
- Important configuration.
- Security or maintenance considerations.

Separate direct dependencies from transitive dependencies. Do not claim a library is used in production merely because it appears in a dependency file.

## 10. Testing and Quality Assurance

Document:
- Existing test framework and configuration.
- Unit, integration, and end-to-end tests.
- Critical business logic test cases.
- API validation.
- Permission and role testing.
- Database transaction testing.
- File upload testing.
- Error and boundary cases.
- Regression testing.
- Manual testing checklists.

Run tests only when appropriate and safe. Do not modify production data or run destructive operations.

Report actual results with the command executed, date, and outcome. If a test has not been run, label it as not executed.

Create a feature-to-test traceability matrix.

## 11. Security Documentation

Document:
- Authentication and session/token handling.
- Role-based or permission-based access.
- Input validation and sanitization.
- Password and credential handling.
- File upload restrictions.
- API security.
- Sensitive data handling.
- CORS and security headers.
- Rate limiting, if implemented.
- Audit logs and access logging.
- Environment variable configuration.
- Known security risks and recommended remediation.

Clearly distinguish implemented protections from recommended improvements.

Never print, copy, or commit actual secrets or environment file values.

## 12. Setup, Deployment, and Troubleshooting

Include:
- Prerequisites.
- Development environment setup.
- Dependency installation.
- Environment variable reference using names and descriptions only.
- Database setup and migration procedures.
- Development startup commands.
- Build commands.
- Test commands.
- Deployment workflow.
- Hosting configuration.
- Logging and monitoring.
- Backup and recovery considerations.
- Common errors and troubleshooting.
- Rollback and maintenance procedures.

Derive commands from actual project configuration. Mark any unverified steps.

## 13. Professional Black Book Formatting

The documentation should resemble a professional academic project report and enterprise technical manual.

Include, where appropriate:
- Cover page.
- Project title and version.
- Document control and revision history.
- Abstract.
- Acknowledgement placeholder, if required.
- Table of contents.
- List of figures.
- List of tables.
- Introduction.
- Existing system and proposed system.
- Requirements analysis.
- System design.
- Implementation details.
- Testing and results.
- Security considerations.
- Limitations.
- Future enhancements.
- Conclusion.
- References.
- Glossary and appendices.

Use consistent heading levels, numbering, terminology, tables, figure captions, diagram references, and cross-links.

Do not invent author details, institutional information, acknowledgements, citations, or experimental results. Use clearly labeled placeholders when information is unavailable.

Keep the main academic report concise and readable. Place detailed APIs, schemas, individual panel specifications, and lengthy technical references in appendices or linked documents.

## 14. Documentation Portal UI

If the repository already contains a suitable documentation interface, improve and reuse it rather than creating a duplicate application.

If a documentation portal needs to be built, first propose the implementation plan and identify the existing frontend stack.

The portal should include:
- Left sidebar with expandable documentation categories.
- Search across titles, headings, and document content.
- Panel-wise navigation.
- Breadcrumbs.
- Table of contents for long pages.
- Mermaid diagrams with readable rendering.
- Charts and tables.
- Code blocks with syntax highlighting.
- Previous/next document navigation.
- Related document links.
- Light and dark themes, if appropriate.
- Responsive desktop, tablet, and mobile layouts.
- Documentation coverage dashboard.
- Clear badges for verified, incomplete, and planned documentation.
- Print-friendly styling.

Maintain the existing application's architecture and design conventions. Do not modify business functionality or production routes to accommodate the documentation portal.

If the project has no suitable frontend, keep the Markdown documentation as the source of truth and recommend an appropriate documentation renderer before implementing an additional application.

## 15. Accuracy and Source Traceability

Every significant technical claim should be traceable to the repository.

Where appropriate, include:
- Source file path.
- Function, class, component, model, or route name.
- Relevant endpoint.
- Database table or model.
- Related diagram.
- Related test.

Use these documentation status labels:
- Verified: directly confirmed in the code or configuration.
- Partially verified: only some aspects have been confirmed.
- Inferred: based on indirect evidence and requiring validation.
- Planned: a recommendation, not an existing feature.

Never silently present inferred behavior as implemented functionality.

## 16. Implementation Workflow

Work in these phases:

Phase 1 — Repository audit and inventory.

Phase 2 — System architecture and technology stack.

Phase 3 — Panel discovery and panel-wise documentation.

Phase 4 — Business logic, API, and database references.

Phase 5 — Flow diagrams, ER diagrams, and useful charts.

Phase 6 — Testing, security, deployment, and user manuals.

Phase 7 — Documentation portal or renderer, if required.

Phase 8 — Cross-link validation, diagram validation, spelling review, and final quality audit.

At the end of each phase:
- List completed documents.
- List remaining work.
- Record unresolved questions.
- Verify generated links and diagrams.
- Update the documentation inventory.

Do not stop after creating a few overview files. Continue through all discovered panels and modules until coverage is complete or a genuine blocker is identified.

## 17. Protect the Existing Project

Before making changes:
- Inspect Git status.
- Identify existing user modifications.
- Avoid overwriting or deleting user work.
- Restrict initial changes to the documentation directory.
- Do not alter business logic, database schemas, migrations, dependencies, or application configuration unless separately required and approved.
- Do not execute destructive commands.
- Do not expose secrets or production data.

If documentation portal development requires application changes, explain the proposed changes before making them.

## 18. Final Deliverables

The final result must include:

1. Complete project inventory.
2. Project overview and architecture documentation.
3. Separate documentation for every discovered panel.
4. Module-wise business logic explanations.
5. API reference.
6. Database dictionary and ER diagrams.
7. Technology and dependency reference.
8. Flow diagrams for important workflows.
9. Useful charts and documentation coverage reporting.
10. Testing and security documentation.
11. Setup, deployment, and troubleshooting guides.
12. User manual.
13. Glossary, references, and revision history.
14. A master README with navigation to all documents.
15. A final audit report showing completed, partially verified, missing, and planned items.


## 19. Final Academic Black Book Generation

In addition to the panel-wise Markdown documentation and documentation portal, generate a separate, professionally formatted, submission-ready UCS CRM Black Book.

### A. Main Report Structure

Organize the report into appropriate chapters:

1. Cover Page
2. Certificate — use a placeholder for authorized signatures
3. Declaration — use a placeholder for the student's declaration
4. Acknowledgement — placeholder for the author to complete
5. Abstract
6. Table of Contents
7. List of Figures
8. List of Tables
9. Introduction
10. Problem Statement and Objectives
11. Existing System and Proposed System
12. Feasibility Study and Requirements Analysis
13. System Architecture and Design
14. Panel-wise Module Design and Implementation
15. Database Design and ER Diagrams
16. API Design and Integration
17. Business Logic and Workflow Diagrams
18. Technologies and Libraries Used
19. Testing Methodology and Actual Results
20. Security and Access Control
21. Deployment and User Manual
22. Limitations and Future Scope
23. Conclusion
24. References
25. Appendices

Adapt the chapter structure to the actual project and any academic requirements provided by the user.

### B. Professional Page Formatting

- Use consistent page margins and readable typography.
- Include page numbers, document title, and appropriate headers and footers.
- Use consistent chapter numbering and subsection numbering.
- Number all figures, tables, and diagrams.
- Add captions and references for each figure and table.
- Generate a proper table of contents and lists of figures and tables.
- Use page breaks before major chapters.
- Prevent diagrams, captions, and tables from being cut off across pages.
- Ensure readable printing in A4 format.
- Use a consistent professional design throughout the document.

### C. Application Screenshots

Where the existing application can be run safely, capture genuine screenshots of important panels, dashboards, forms, tables, and workflows.

Use actual application screenshots only. Never fabricate screenshots or represent mockups as implemented functionality.

Include figure numbers, captions, and explanations. Mask confidential data and use test data wherever possible.

If screenshots cannot be captured, document the limitation and identify the screenshots that need to be added later.

### D. PDF and Editable Source

Create:
- An editable source document.
- A final PDF version.
- A separate technical documentation directory containing detailed panel-wise documentation and diagrams.

Use an appropriate document-generation tool already available in the environment. If no suitable tool is available, explain the requirement and propose a safe implementation before adding dependencies.

Ensure that diagrams render correctly in the PDF and that text is selectable and searchable.

Do not create a PDF that contains only a list of Markdown filenames or unrendered Mermaid code.

### E. Final Quality Audit

Before declaring the black book complete:

1. Verify that every discovered panel has been documented.
2. Check every chapter and subsection for completeness.
3. Validate diagram syntax and readability.
4. Verify figure and table numbering.
5. Validate internal links and the table of contents.
6. Check page numbering and page breaks.
7. Verify that no secrets or real confidential records are exposed.
8. Separate verified implementation details from recommendations and placeholders.
9. Reconcile the PDF with the editable source.
10. Produce a final audit report listing missing information, incomplete chapters, and remaining manual work.

Never claim the report is submission-ready if required academic details, screenshots, actual test results, or institutional formatting requirements are still missing.

Save the final files in a clearly named output directory, such as docs/output/, without overwriting existing user files.  

## Start Now

Begin with repository inspection and the project inventory.

Then work systematically through the phases, generating real documentation from the source code.

Prioritize correctness, completeness, traceability, readability, and maintainability over document count.

Do not guess. Do not invent. Do not stop at generic documentation.

At completion, provide a concise report of what was created, which panels were covered, what was verified, what remains incomplete, and how to view or build the documentation.