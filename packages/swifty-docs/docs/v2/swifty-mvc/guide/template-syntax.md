# Template Syntax

swifty-mvc templates are HTML files compiled at build time into JavaScript render functions. The compiler transforms a declarative template syntax into optimized code that executes in the browser, eliminating runtime parsing overhead and reducing bundle size.

## Compilation Pipeline

The compilation process runs through several phases. The bundler plugin (Vite, Webpack, or Rspack) first extracts global variables via `extractGlobalVars()` before invoking `compileTemplate()`. Inside the compiler, the template source goes through sequential transformation phases.

Bundler plugin level:

```
extractGlobalVars (AST analysis)
  → compileTemplate(source, { globalVars, ...options })
```

Compiler internal phases:

```
protectComments
  → convertArtSyntax ({{}} → <% %>)
    → processViewEvents (@event)
      → restoreComments
        → compileToFunction / compileToVDomFunction
```

The `globalVars` extracted by the bundler plugin are passed as a pre-computed option to `compileTemplate`, not as a phase within the compiler itself.

### Phase 1: Comment Protection

HTML comments are extracted and replaced with placeholders before any template processing occurs. This prevents template syntax inside comments from being transformed.

Input:

```html
<!-- {{=shouldNotRender}} -->
<p>{{=text}}</p>
```

After protection:

```
__swifty_comment_0__
<p>{{=text}}</p>
```

Comments are restored after all template transformations complete.

### Phase 2: Syntax Conversion

The `{{}}` art-template syntax is converted to internal `<% %>` syntax. This phase also adds line-number markers in debug mode for error reporting.

Input:

```html
{{=name}} {{if active}}visible{{/if}}
```

After conversion:

```
<%=name%>
<%if(active){%>visible<%}%>
```

### Phase 3: Event Processing

`@event` attributes are processed to inject view ID prefixes and convert JavaScript object literals to URL query parameters.

Input:

```html
<div @click="handler({id: 123, name: 'test'})">click</div>
```

After processing:

```html
<div @click="\x1f\x1ehandler(id=123&name=test)">click</div>
```

The `\x1f` (U+001F, `VIEW_ID_PLACEHOLDER`) is a placeholder that is replaced at runtime with the actual view ID during template execution, not at compile time. The `\x1e` (U+001E, `SPLITTER`) separates the view ID from the handler expression. When the updater renders the template, the placeholder is substituted with the concrete view ID, enabling the event delegator to route events to the correct view instance.

### Phase 4: Comment Restoration

Protected comments are restored to their original form.

### Phase 5: Global Variable Extraction

An AST-based analyzer walks the template to identify all variables that must be passed in from the data context. This enables zero-config variable detection without manual declaration.

### Phase 6: Code Generation

The template is compiled to either a string-based render function or a VDOM-based render function, depending on the compilation mode.

String mode output:

```javascript
import { encHtml, strSafe, encUri, encQuote, refFn } from "swifty-mvc/runtime";
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
    let name = $data.name;
    $out += "";
    $out += $encHtml(name);
    $out += "";
    return $out;
  })($data, $viewId, refData, encHtml, strSafe, encUri, refFn, encQuote);
}
export default __swiftyTemplate;
```

## Text Interpolation

Four interpolation operators control how expressions are rendered into the output.

### Escaped Output: {{=expr}}

The `=` operator HTML-escapes the expression result, converting special characters to entities. This is the safest default for rendering user-provided data.

Input:

```html
<p>Hello, {{=name}}!</p>
<p>HTML: {{=html}}</p>
```

Data:

```javascript
{ name: "Alice", html: "<b>bold</b>" }
```

Output:

```html
<p>Hello, Alice!</p>
<p>HTML: &lt;b&gt;bold&lt;/b&gt;</p>
```

Null and undefined values are converted to empty strings:

Input:

```html
<span>{{=missing}}</span>
```

Output:

```html
<span></span>
```

### Two-Way Binding: {{:expr}}

The `:` operator renders identically to `=` at the template level but signals intent for two-way data binding when used with form inputs. The compiler treats both operators the same way during rendering.

Input:

```html
<input value="{{:username}}" />
```

Output:

```html
<input value="john_doe" />
```

### Raw Output: {{!expr}}

The `!` operator outputs the expression result without HTML escaping. Use this when the value contains trusted HTML markup.

Input:

```html
<div>{{!htmlContent}}</div>
```

Data:

```javascript
{
  htmlContent: "<p>Paragraph with <strong>emphasis</strong></p>";
}
```

Output:

```html
<div>
  <p>Paragraph with <strong>emphasis</strong></p>
</div>
```

### Reference Lookup: {{@expr}}

The `@` operator allocates a stable token in the refData table for a JavaScript object reference. This enables passing live objects (not serialized strings) through the DOM to child views.

Input:

```html
<div v-swifty="components/detail" data-item="{{@item}}"></div>
```

The compiler emits a `$refFn($refAlt, item)` call that returns a SPLITTER-prefixed key. The child view retrieves the original object by looking up this key in its refData context.

## Conditionals

Conditional blocks render content based on boolean expressions. The syntax supports `if`, `else if`, and `else` branches.

### Basic If

Input:

```html
{{if showBanner}}
<div class="banner">Welcome!</div>
{{/if}}
```

Data:

```javascript
{
  showBanner: true;
}
```

Output:

```html
<div class="banner">Welcome!</div>
```

### If-Else

Input:

```html
{{if isLoggedIn}}
<button>Logout</button>
{{else}}
<button>Login</button>
{{/if}}
```

Data:

```javascript
{
  isLoggedIn: false;
}
```

Output:

```html
<button>Login</button>
```

### If-Else If-Else

Input:

```html
{{if status === 'active'}}
<span class="green">Active</span>
{{else if status === 'pending'}}
<span class="yellow">Pending</span>
{{else}}
<span class="gray">Inactive</span>
{{/if}}
```

Data:

```javascript
{
  status: "pending";
}
```

Output:

```html
<span class="yellow">Pending</span>
```

### Complex Expressions

Conditional expressions can use any valid JavaScript operators:

Input:

```html
{{if user.age >= 18 && user.verified}}
<p>Verified adult user</p>
{{/if}}
```

## Loops

Three loop constructs handle iteration over arrays, objects, and numeric ranges.

### Array Iteration: {{each}}

The `each` loop iterates over array elements. The `as` keyword separates the collection from the iteration variables.

Basic form:

```html
{{each list as item}}
<li>{{=item}}</li>
{{/each}}
```

With index:

```html
{{each list as item index}}
<li>{{=index}}: {{=item}}</li>
{{/each}}
```

Input:

```html
<ul>
  {{each users as user idx}}
  <li>{{=idx}}. {{=user.name}}</li>
  {{/each}}
</ul>
```

Data:

```javascript
{
  users: [{ name: "Alice" }, { name: "Bob" }];
}
```

Output:

```html
<ul>
  <li>0. Alice</li>
  <li>1. Bob</li>
</ul>
```

Nested loops work naturally:

Input:

```html
{{each matrix as row}}
<tr>
  {{each row as cell}}
  <td>{{=cell}}</td>
  {{/each}}
</tr>
{{/each}}
```

### Object Iteration: {{forin}}

The `forin` loop iterates over object properties.

Input:

```html
{{forin config as value key}}
<div>{{=key}}: {{=value}}</div>
{{/forin}}
```

Data:

```javascript
{ config: { theme: "dark", lang: "en", debug: true } }
```

Output:

```html
<div>theme: dark</div>
<div>lang: en</div>
<div>debug: true</div>
```

### Numeric Loop: {{for}}

The `for` loop supports standard C-style iteration.

Input:

```html
{{for(let i=0; i<3; i++)}}
<span>{{=i}}</span>
{{/for}}
```

Output:

```html
<span>0</span>
<span>1</span>
<span>2</span>
```

## Variable Declaration

The `set` keyword declares local variables within the template scope.

Input:

```html
{{set greeting = "Hello", count = 42}}
<p>{{=greeting}}, count is {{=count}}</p>
```

Output:

```html
<p>Hello, count is 42</p>
```

Variables declared with `set` are local to the template and do not need to be passed in the data context. The compiler excludes them from the global variable extraction pass.

Input:

```html
{{set total = price * quantity}}
<p>Total: {{=total}}</p>
```

Data:

```javascript
{ price: 10, quantity: 5 }
```

Output:

```html
<p>Total: 50</p>
```

## Event Binding

The `@event` attribute binds DOM events to view handler methods. The compiler injects view ID prefixes and encodes parameters for runtime dispatch.

### Basic Event Binding

Input:

```html
<button @click="saveData()">Save</button>
```

The compiler transforms this to include the view ID prefix and SPLITTER separator, enabling the event delegator to route the event to the correct view instance.

### Handler Naming Convention

View methods use the `handler<eventType>` naming convention to declare event handlers:

```javascript
defineView({
  events: {
    "saveData<click>": function (e) {
      // handle click
    },
  },
});
```

### Selector Delegation

The `$selector<eventType>` pattern delegates events to child elements matching a CSS selector:

```javascript
defineView({
  events: {
    "$button.primary<click>": function (e) {
      // fires when any .primary button inside the view is clicked
    },
  },
});
```

### Window and Document Events

Global events can be bound to `window` or `document`:

```javascript
defineView({
  events: {
    "$window<resize>": function (e) {
      // handle window resize
    },
    "$document<keydown>": function (e) {
      // handle document keydown
    },
  },
});
```

### Modifier Keys

Event handlers can require modifier keys:

```javascript
defineView({
  events: {
    "save<click><ctrl>": function (e) {
      // fires only when Ctrl is held during click
    },
    "select<click><shift>": function (e) {
      // fires only when Shift is held
    },
  },
});
```

### Multi-Event Binding

A single handler can respond to multiple event types:

```javascript
defineView({
  events: {
    "update<click,mousedown>": function (e) {
      // fires on both click and mousedown
    },
  },
});
```

### Event Parameters

Handler methods receive parameters passed in the template:

Input:

```html
<button @click="deleteItem({id: item.id, confirm: true})">Delete</button>
```

The compiler converts the object literal to URL query parameters:

```html
<button @click="\x1f\x1edeleteItem(id=123&confirm=true)">Delete</button>
```

The handler receives these as a params object:

```javascript
defineView({
  events: {
    "deleteItem<click>": function (e) {
      const { id, confirm } = e.params;
      // id = "123", confirm = "true"
    },
  },
});
```

## Embedded Views

The `v-swifty` attribute declares a child view embedding point. The value is the view path that will be loaded and rendered at that location.

Input:

```html
<div v-swifty="components/user-profile" data-user="{{@currentUser}}"></div>
```

The child view receives the parent's refData context, enabling object reference passing via the `@` operator. The framework automatically manages view lifecycle, mounting the child view when the parent renders and unmounting it when the parent updates or unmounts.

Nested views form a tree structure:

Input:

```html
<div v-swifty="layouts/sidebar">
  <div v-swifty="widgets/navigation"></div>
  <div v-swifty="widgets/search"></div>
</div>
```

## Global Variable Extraction

The compiler performs AST-based analysis to automatically detect all variables that must be provided in the data context. This eliminates the need for manual variable declaration or registration.

The extraction process:

1. Converts template syntax to an intermediate form parseable by Babel
2. Walks the AST to identify all identifier references
3. Tracks variable declarations (`set`, loop variables, function parameters) as local
4. Filters out JavaScript built-ins (Math, JSON, Array, etc.)
5. Returns the remaining identifiers as required global variables

Example template:

```html
{{if user.active}}
<p>{{=user.name}} joined on {{=formatDate(user.joinDate)}}</p>
{{each user.posts as post}}
<div>{{=post.title}}</div>
{{/each}} {{/if}}
```

Extracted global variables:

```javascript
["user", "formatDate"];
```

The compiler generates variable declarations at the top of the render function:

```javascript
let user = $data.user,
  formatDate = $data.formatDate;
```

Local variables (`post` from the loop) are excluded from extraction.

## Runtime Helpers

Five helper functions are imported from `swifty-mvc/runtime` and injected into compiled templates. These helpers are shared across all templates to minimize bundle size.

### strSafe

Null-safe string conversion. Converts `null` and `undefined` to empty strings, otherwise calls `toString()`.

```javascript
strSafe(null); // ""
strSafe(undefined); // ""
strSafe(42); // "42"
strSafe("hello"); // "hello"
```

Applied to all `{{!raw}}` outputs to prevent rendering the literal strings "null" or "undefined".

### encHtml

HTML entity encoder. Escapes `&`, `<`, `>`, `"`, `'`, and backtick characters.

```javascript
encHtml("<b>test</b>"); // "&lt;b&gt;test&lt;/b&gt;"
encHtml('a"b'); // "a&quot;b"
```

Applied to all `{{=escaped}}` and `{{:binding}}` outputs.

### encUri

URI encoder with extended character set. Wraps `encodeURIComponent` and additionally encodes `!`, `'`, `(`, `)`, and `*`.

```javascript
encUri("hello world"); // "hello%20world"
encUri("it's"); // "it%27s"
```

Applied to values in `@event` URL parameters for stricter URI compliance.

### encQuote

Quote and backslash encoder for attribute string contents.

```javascript
encQuote('a"b'); // "a\\\"b"
encQuote("a'b"); // "a\\'b"
encQuote("a\\b"); // "a\\\\b"
```

Used when embedding values in HTML attribute strings.

### refFn

Reference lookup function. Allocates or retrieves a stable token in the refData table for a JavaScript object reference.

```javascript
refFn(refData, myObject); // "\x1e0"
refFn(refData, myObject); // "\x1e0" (same token for same reference)
refFn(refData, otherObj); // "\x1e1"
```

The token is written into DOM attributes by `{{@expr}}` and resolved back to the original object when the child view accesses its refData context. This enables passing live JavaScript objects (functions, class instances, complex data structures) through the DOM without serialization.
