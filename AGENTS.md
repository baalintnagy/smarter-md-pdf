# Source style

Use four spaces, a 100-character target width, single quotes in JavaScript, and LF
line endings. YAML uses two spaces. Keep braces around conditional and loop bodies,
remove unused bindings, and use `_` for unused catch variables when a binding is
needed. Prefer collection operations for stateless transformations; retain loops
that manage state, resources, or control flow.

Run `npm run format` to apply Prettier and `npm run lint:fix` to apply supported
ESLint fixes. Run `npm run check:style` to check both without modifying files.
Formatting excludes vendored code, license notices, generated output, and dependency
lockfiles. Keep these rules and their tool configuration in sync.

For review, put arguments containing calls, constructor calls, or callbacks on
separate continuation lines when useful for breakpoints, and break compound
call-based conditions before boolean operators. Prettier controls automatic layout;
these breakpoint-oriented preferences are not fully enforced by the formatter.
Java-specific conventions from the sibling PermaFormula repositories do not apply
to this JavaScript project.
