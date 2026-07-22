# Compiler API {#compiler-api}

The swifty-mvc template compiler transforms `.html` template files into optimized JavaScript render functions at build time. The compiler runs exclusively in Node.js and is consumed through Vite, Webpack, or Rspack plugins. The resulting modules are imported by the view layer and executed in the browser.

This page documents the public compile-time API exported from `swifty-mvc/compiler`.

## compileTemplate {#compile-template}

```typescript
function compileTemplate(
  source: string,
  options?: CompileOptions,
): Promise<string>;
```

Compiles an HTML template string into an ES module that exports a render function. This is the main entry point for build-tool integrations.

The returned module exports a default function with the signature `(data, viewId, refData) => string` in string mode, or `(data, viewId, refData) => VDomNode` in VDOM mode.

### Parameters {#compile-template-parameters}

| Parameter | Type             | Description                                                 |
| --------- | ---------------- | ----------------------------------------------------------- |
| `source`  | `string`         | Raw HTML template content using `{{ }}` art-template syntax |
| `options` | `CompileOptions` | Optional compilation options (see below)                    |

### Return Value {#compile-template-return}

A `Promise<string>` that resolves to ES module source code. The module imports runtime helpers from `swifty-mvc/runtime` and exports a named `__swiftyTemplate` function as the default export.

### Compilation Pipeline {#compilation-pipeline}

The compiler processes templates in four sequential phases:

1. Comment protection -- HTML comments are temporarily replaced with placeholders to prevent template syntax inside comments from being processed
2. Art-syntax conversion -- `{{ }}` expressions are converted to the internal `<% %>` representation with optional debug line markers
3. View event processing -- `@event` attributes are encoded with view ID placeholders and SPLITTER separators for the runtime event delegator
4. Code generation -- The `<% %>` source is compiled into a JavaScript arrow function body, wrapped in an ES module that imports runtime helpers

### Example {#compile-template-example}

```typescript
import { compileTemplate } from "swifty-mvc/compiler";

const source = `<div>{{=title}}</div>`;

const moduleCode = await compileTemplate(source, {
  debug: false,
  file: "src/views/home.html",
});
```

The output is a string containing ES module source code:

```javascript
import {
  encHtml as __swiftyEncHtml,
  strSafe as __swiftyStrSafe,
  encUri as __swiftyEncUri,
  encQuote as __swiftyEncQuote,
  refFn as __swiftyRefFn,
} from "swifty-mvc/runtime";

function __swiftyTemplate(data, viewId, refData) {
  let $data = data || {},
    $viewId = viewId || "";
  return ((
    $data,
    $viewId,
    $refAlt,
    $encHtml,
    $strSafe,
    $encUri,
    $refFn,
    $encQuote,
  ) => {
    // ... compiled function body
  })(
    $data,
    $viewId,
    refData,
    __swiftyEncHtml,
    __swiftyStrSafe,
    __swiftyEncUri,
    __swiftyRefFn,
    __swiftyEncQuote,
  );
}
export default __swiftyTemplate;
```

## extractGlobalVars {#extract-global-vars}

```typescript
function extractGlobalVars(source: string): Promise<string[]>;
```

Performs AST-based extraction of template data variables using `@babel/parser`. The result is the set of global variable names that the template references but does not declare internally. These variables must be supplied via the `data` object when invoking the compiled render function.

This function enables zero-configuration variable auto-detection: the compiler can determine which data properties a template needs without requiring explicit declarations from the developer.

### Parameters {#extract-global-vars-parameters}

| Parameter | Type     | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `source`  | `string` | Raw HTML template content using `{{ }}` syntax |

### Return Value {#extract-global-vars-return}

A `Promise<string[]>` that resolves to an array of variable name strings.

### How It Works {#extract-global-vars-how-it-works}

The extraction process converts template commands into a JavaScript-parseable form, then walks the AST with scope tracking:

1. Template syntax (`{{ }}`) is converted to `<% %>` so embedded expressions become analyzable
2. HTML text between `<% %>` blocks is replaced with placeholders, keeping only the JS code
3. The resulting pseudo-JS is parsed with `@babel/parser` using `allowReturnOutsideFunction` and `allowAwaitOutsideFunction`
4. The AST is walked twice: the first pass collects variable declarations and function scopes; the second pass identifies all `Identifier` nodes that are not locally declared, not function parameters, and not in the built-in globals exclusion list

If AST parsing fails (for example, due to malformed template syntax), the function falls back to a regex-based extraction that covers the most common output and loop patterns.

### Example {#extract-global-vars-example}

```typescript
import { extractGlobalVars } from "swifty-mvc/compiler";

const source = `
  <h1>{{=title}}</h1>
  {{each items as item}}
    <p>{{=item.name}}</p>
  {{/each}}
  {{if showFooter}}
    <footer>{{=footerText}}</footer>
  {{/if}}
`;

const vars = await extractGlobalVars(source);
// Result: ["title", "items", "showFooter", "footerText"]
```

Note that `item` is not included in the result because it is declared by the `{{each}}` block.

## CompileOptions {#compile-options}

```typescript
interface CompileOptions {
  debug?: boolean;
  globalVars?: string[];
  file?: string;
  vdom?: boolean;
}
```

Configuration object accepted by `compileTemplate`.

| Property     | Type       | Default       | Description                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`      | `boolean`  | `false`       | Enable debug mode. When `true`, the compiler inserts line-number markers and wraps the generated function body in a try-catch block. Runtime errors include the original template expression, the source line number, and the file path in the error message.                                                                                                       |
| `globalVars` | `string[]` | auto-detected | Explicit list of variable names to destructure from the `data` parameter. When omitted, the compiler calls `extractGlobalVars(source)` to determine the list automatically.                                                                                                                                                                                         |
| `file`       | `string`   | `undefined`   | File path included in debug error messages. Typically the absolute or project-relative path to the `.html` template file being compiled.                                                                                                                                                                                                                            |
| `vdom`       | `boolean`  | `false`       | Generate a VDOM-mode template instead of a string-mode template. When `true`, the compiled module imports `vdomCreate` from `swifty-mvc` and the render function returns a `VDomNode` tree rather than an HTML string. The resulting module does not import `encHtml` since VDOM text nodes use `createTextNode` semantics and do not require HTML entity escaping. |

## Template Syntax Reference {#template-syntax-reference}

Templates use double-brace `{{ }}` delimiters for expressions and control flow. The compiler converts these to an internal `<% %>` representation before generating JavaScript.

### Output Operators {#output-operators}

| Syntax      | Description                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{=expr}}` | HTML-escaped output. Encodes `&`, `<`, `>`, `"`, `'`, and `` ` `` to HTML entities. This is the default and recommended operator for rendering data.                          |
| `{{:expr}}` | Two-way binding output. Rendered identically to `{{=expr}}` (HTML-escaped), but semantically marks the expression as a data binding target.                                   |
| `{{!expr}}` | Raw output. The expression value is converted to a string via `strSafe` (null-safe `toString`) but is not HTML-escaped. Use only for trusted content.                         |
| `{{@expr}}` | Reference lookup. Allocates a SPLITTER-prefixed key in `refData` for the given object reference. Used for passing object references to child views via `v-swifty` attributes. |

### Control Flow {#control-flow}

| Syntax                                   | Description                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| `{{if condition}}`                       | Conditional block. The condition is a JavaScript expression. |
| `{{else if condition}}`                  | Else-if branch within a conditional block.                   |
| `{{else}}`                               | Else branch within a conditional block.                      |
| `{{/if}}`                                | Close a conditional block.                                   |
| `{{each list as item}}`                  | Iterate over an array.                                       |
| `{{each list as item index}}`            | Iterate over an array with an index variable.                |
| `{{each list as item index last first}}` | Iterate with index, last-item flag, and first-item flag.     |
| `{{/each}}`                              | Close an each block.                                         |
| `{{forin obj as value key}}`             | Iterate over an object's enumerable properties.              |
| `{{/forin}}`                             | Close a forin block.                                         |
| `{{for(init; test; update)}}`            | Generic C-style for loop.                                    |
| `{{/for}}`                               | Close a for block.                                           |

### Variable Declaration {#variable-declaration}

| Syntax                 | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `{{set name = value}}` | Declare a local variable within the template scope. Compiles to `let name = value`. |

### Event Attributes {#event-attributes}

Event handlers are declared with the `@event` attribute syntax:

```html
<button @click="handleClick({id: itemId})">Click</button>
```

The compiler processes `@event` attributes by prepending a view ID placeholder and SPLITTER separator, and by converting JavaScript object literal parameters to URL query parameter format. The runtime event delegator uses these markers to route events to the correct view instance and handler function.

## Runtime Helpers {#runtime-helpers}

The compiled template module imports the following helper functions from `swifty-mvc/runtime`. These helpers are passed as parameters to the inner compiled function and are not directly callable from application code.

### strSafe {#str-safe}

```typescript
function strSafe(v: unknown): string;
```

Null-safe string conversion. Returns an empty string for `null` and `undefined`, otherwise calls `toString()` on the value. This helper wraps every `{{!raw}}` output expression to prevent the literal strings `"null"` and `"undefined"` from appearing in the rendered DOM.

### encHtml {#enc-html}

```typescript
function encHtml(v: unknown): string;
```

HTML entity encoder. Converts the value to a string via `strSafe`, then replaces `&`, `<`, `>`, `"`, `'`, and `` ` `` with their corresponding HTML entities (`&amp;`, `&lt;`, `&gt;`, `&#34;`, `&#39;`, `&#96;`). Applied to all `{{=escaped}}` and `{{:binding}}` output expressions.

### encUri {#enc-uri}

```typescript
function encUri(v: unknown): string;
```

Extended URI encoder. Converts the value to a string via `strSafe`, applies `encodeURIComponent`, then additionally encodes the characters `!`, `'`, `(`, `)`, and `*` which are not encoded by the standard `encodeURIComponent`. Used in `@event` URL parameters and URI-sensitive contexts.

### encQuote {#enc-quote}

```typescript
function encQuote(v: unknown): string;
```

Quote and backslash escaper. Converts the value to a string via `strSafe`, then escapes single quotes, double quotes, and backslashes by prefixing them with a backslash. Used for embedding values safely within HTML attribute strings.

### refFn {#ref-fn}

```typescript
function refFn(refData: Record<string, unknown>, value: unknown): string;
```

Reference lookup function. Finds or allocates a SPLITTER-prefixed key in `refData` for a given object reference. Returns the allocated key string. Used by the `{{@ref}}` operator to pass object references to child views through `v-swifty` attributes without serializing the object.

When a template does not use the `@` operator, `refData` is not required and the compiler sets `$refAlt` to `$data` as a fallback.
