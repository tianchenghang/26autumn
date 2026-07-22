---
title: Template Syntax
description: Complete reference for the Swifty MVC template expression language, control flow, and operators.
---

# Template Syntax {#template-syntax}

Swifty MVC templates are HTML files with a custom expression syntax based on double curly braces. Templates are compiled at build time into optimized JavaScript functions that produce either HTML strings (string mode) or virtual DOM trees (VDOM mode).

This page is the complete reference for all template operators and constructs.

## Output operators {#output-operators}

### Escaped output: `{{=expr}}` {#escaped-output}

Outputs the result of `expr` with HTML escaping. This is the default and safest output mode:

```html
<p>Hello, {{=user.name}}</p>
<!-- If user.name is "<script>", outputs: &lt;script&gt; -->
```

The compiler converts `{{=expr}}` to `$encHtml(expr)`, which escapes `<`, `>`, `&`, `"`, `'`, and `` ` ``.

### Binding output: `{{:expr}}` {#binding-output}

Outputs the result of `expr` as a data binding. For rendering purposes, this behaves identically to `{{=expr}}`. The distinction is semantic — bindings indicate a two-way data relationship:

```html
<input value="{{:formData.name}}" />
```

### Raw output: `{{!expr}}` {#raw-output}

Outputs the result of `expr` without any escaping. Use this only for trusted content:

```html
<div>{{!trustedHtmlContent}}</div>
<!-- If trustedHtmlContent is "<b>bold</b>", renders actual bold text -->
```

The compiler converts `{{!expr}}` to `$strSafe(expr)`.

### Reference lookup: `{{@expr}}` {#reference-lookup}

The `$refFn` helper performs a reverse lookup into the view's `refData` table. It evaluates the expression, then iterates `refData` entries looking for one where `value === expressionResult`:

- If a match is found, it returns the existing SPLITTER-prefixed key already stored in `refData`
- If no match is found, it allocates a NEW SPLITTER-prefixed key, stores the value in `refData`, and returns that key

```html
<div>{{@user.name}}</div>
<!-- Evaluates user.name, searches refData for a matching value,
     returns existing key or allocates a new one -->
```

This is how templates pass non-serializable objects (functions, complex objects) into the compiled template. The compiler converts `{{@expr}}` to `$refFn($refAlt, expr)`.

## Control flow {#control-flow}

### Conditionals {#conditionals}

```html
{{if condition}}
<p>Condition is truthy</p>
{{else if otherCondition}}
<p>Other condition is truthy</p>
{{else}}
<p>Neither condition is truthy</p>
{{/if}}
```

The compiler converts these to standard JavaScript `if/else if/else` statements:

```js
// Compiled output (simplified):
if (condition) {
  // ...
} else if (otherCondition) {
  // ...
} else {
  // ...
}
```

### Negation {#negation}

Use standard JavaScript negation in conditions:

```html
{{if !isLoading}}
<p>Content loaded</p>
{{/if}}
```

### Complex expressions {#complex-expressions}

Any valid JavaScript expression can be used in conditions:

```html
{{if user.role === 'admin' && user.verified}}
<span class="badge">Verified Admin</span>
{{/if}}
```

## Loops {#loops}

### forOf — array iteration {#for-of}

Iterate over arrays with access to the current item and index:

```html
{{forOf items as item idx isLast isFirst}}
<div
  id="item-{{=idx}}"
  class="{{if isFirst}}first{{/if}} {{if isLast}}last{{/if}}"
>
  {{=idx}}: {{=item.name}}
</div>
{{/forOf}}
```

Parameters:

- `items` — the array to iterate over
- `item` — variable name for the current element
- `idx` — variable name for the current index (0-based)
- `isLast` — explicit variable name for the "is last" helper (position 4 in the syntax)
- `isFirst` — explicit variable name for the "is first" helper (position 5 in the syntax)

These helpers are not automatic — they require explicit variable names declared in the `forOf` syntax. The names can be chosen freely, but positions 4 and 5 must be present to receive the helpers:

- Position 4 (e.g. `isLast`) — true when `idx === items.length - 1`
- Position 5 (e.g. `isFirst`) — true when `idx === 0`

The compiler converts `forOf` to a standard `for` loop with `let` declarations:

```js
for (let idx = 0; idx < items.length; idx++) {
  let item = items[idx];
  // ...
}
```

### forIn — object iteration {#for-in}

Iterate over an object's enumerable properties:

```html
{{forIn config as value key}}
<dt>{{=key}}</dt>
<dd>{{=value}}</dd>
{{/forIn}}
```

Parameters:

- `config` — the object to iterate over
- `value` — variable name for the property value
- `key` — variable name for the property key

The compiler converts `forIn` to a `for...in` loop:

```js
for (let key in config) {
  let value = config[key];
  // ...
}
```

### for — generic loop {#for-generic}

A standard C-style for loop for custom iteration:

```html
{{for(let i = 0; i < 10; i += 2)}}
<span>{{=i}}</span>
{{/for}}
```

The content between `{{for(...)}}` and `{{/for}}` is placed directly inside the loop body.

### Nested loops {#nested-loops}

Loops can be nested freely:

```html
{{forOf rows as row rowIdx}}
<tr>
  {{forOf row.cells as cell colIdx}}
  <td>{{=cell}}</td>
  {{/forOf}}
</tr>
{{/forOf}}
```

## Variable declarations {#variable-declarations}

Use `{{set}}` to declare variables within a template:

```html
{{set fullName = user.firstName + ' ' + user.lastName}} {{set itemCount =
items.length}}

<p>{{=fullName}} has {{=itemCount}} items</p>
```

The compiler converts `{{set name = expr}}` to `let name = expr;`. Variables are scoped to the enclosing block (loop body, conditional branch, or template root).

## HTML comments {#html-comments}

HTML comments are preserved through compilation:

```html
<!-- This is a section header -->
<h1>{{=title}}</h1>
```

The compiler temporarily replaces comments with placeholders during syntax conversion and restores them before the final compilation step.

## Special elements {#special-elements}

### Embedded child views {#child-views}

The `v-swifty` attribute marks a DOM element as a mount point for a child Frame:

```html
<div v-swifty="sidebar"></div>
<div v-swifty="content"></div>
```

The framework creates a child Frame for each `v-swifty` element during `mountZone`. The attribute value becomes the Frame's ID.

### Form elements {#form-elements}

The DOM diff engine has special handling for form elements to preserve user-facing state:

- `<input>` — `value` and `checked` properties are synced directly on the DOM element (not via attributes) to avoid cursor position loss
- `<textarea>` — `value` property is synced directly
- `<option>` — `selected` property is synced directly

This ensures that typing in an input field does not cause the cursor to jump when the view re-renders.

## Compilation pipeline {#compilation-pipeline}

Templates go through these transformations at build time:

```
1. extractGlobalVars  — AST-based variable detection (Babel), runs FIRST with its own sub-pipeline
2. protectComments    — replace <!-- --> with placeholders
3. convertArtSyntax   — {{expr}} -> <% expr %> internal syntax
4. processViewEvents  — @click -> encoded event attributes
5. restoreComments    — restore HTML comments
6. compileToFunction  — generate JavaScript function (or compileToVDomFunction for VDOM mode)
7. wrapModule         — ES module with runtime imports
```

### Variable extraction {#variable-extraction}

The compiler uses Babel to analyze the generated JavaScript and determine which closure variables the template references. These are imported as named parameters in the generated module:

```js
// Generated module (simplified):
import { encHtml, strSafe, refFn } from "@swifty.js/mvc/runtime";

export default function template($data) {
  let user = $data.user,
    items = $data.items,
    title = $data.title;
  // ... template body using user, items, title
}
```

This ensures the template function receives exactly the variables it needs — no more, no less.

### Dual-mode output {#dual-mode-output}

The same template source can be compiled to either:

- String mode: a function that returns an HTML string
- VDOM mode: a function that returns a tree of `VDomNode` objects

The mode is selected via the bundler plugin's `vdom` option. The template source does not need to change.

## Runtime helpers {#runtime-helpers}

Compiled templates import helpers from `@swifty.js/mvc/runtime`:

| Helper                | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `strSafe(value)`      | Convert value to string, handling null/undefined                            |
| `encHtml(value)`      | HTML-escape a string                                                        |
| `encUri(value)`       | URI-encode a string                                                         |
| `encQuote(value)`     | Escape single quotes, double quotes, and backslashes (regex: `/['"\\\\]/g`) |
| `refFn(refAlt, expr)` | Resolve a reference from the refData table                                  |

These helpers are tiny (a few bytes each) and are tree-shaken — only the helpers actually used by a template are included in the bundle.

## Next steps {#next-steps}

- [Views and Templates](/docs/en/swifty-mvc/guide/essentials/views) — view lifecycle and event handling
- [Bundler Integration](/docs/en/swifty-mvc/guide/advanced/bundler-integration) — configuring Vite, Webpack, and Rspack
- [Rendering Engine](/docs/en/swifty-mvc/guide/advanced/rendering-engine) — the DOM diff and virtual DOM reconciliation engines
