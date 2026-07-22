# Theme Config

The swifty-docs default theme is a set of four composable views styled with Tailwind CSS and DaisyUI. This page is a reference for every layout region, responsive breakpoint, styling convention, icon, and customization point available in the built-in theme.

## Layout Structure {#layout-structure}

The theme renders every documentation page through four views registered under the `theme/` namespace. Each view is a self-contained swifty-mvc view with its own template, assign logic, and event handlers.

### View Composition {#view-composition}

| View              | Namespace           | Role                                                                                                                                     |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Docs Layout       | `theme/docs-layout` | Root container. Renders the navbar, sidebar, main content area, table of contents, and search modal. Stays mounted across route changes. |
| Sidebar           | `theme/sidebar`     | Left-hand navigation tree. Reads sidebar configuration from State and marks the active item.                                             |
| Table of Contents | `theme/toc`         | Right-hand heading outline. Extracts h2 and h3 headings and tracks the visible heading via IntersectionObserver.                         |
| Search            | `theme/search`      | Full-text search modal. Uses MiniSearch with prefix matching, fuzzy matching, and field-weighted scoring.                                |

The views are registered together by calling `registerThemeViews()` once during application boot:

```ts
import { Framework } from "swifty-mvc";
import { registerThemeViews } from "swifty-docs/theme";

Framework.boot(config);
registerThemeViews();
```

### Page Regions {#page-regions}

The docs-layout template divides the screen into five regions:

```
+------------------------------------------+
|              Navbar (sticky)             |
+------+-------------------+--------------+
|      |                   |              |
| Side |   Main content    |     TOC      |
| bar  |   (prose)         |              |
|      |                   |              |
|      |   [prev] [next]   |              |
+------+-------------------+--------------+
|         Search modal (overlay)           |
+------------------------------------------+
```

Navbar. The top bar uses DaisyUI's `navbar` component with three sections: `navbar-start` for the site title, `navbar-center` for top-level navigation links, and `navbar-end` for the search button or DocSearch widget. The navbar is sticky (`sticky top-0`) with a backdrop blur effect and a bottom border.

Sidebar. Rendered inside an `<aside>` element with a right border. The sidebar view formats each route prefix into a group header by stripping slashes, replacing hyphens with spaces, and capitalizing each word. For example, `/docs/guide/` becomes "Docs Guide".

Main content. The `<main>` element renders the compiled Markdown HTML inside an `<article>` with Tailwind's Typography plugin classes (`prose prose-sm max-w-none`). Below the article, previous and next page links are computed from the flattened sidebar order.

Table of contents. Rendered inside a second `<aside>` element. The section header reads "On this page". Each h2 heading appears as a top-level item; each h3 heading is indented with `pl-2`. The active heading receives a distinct background and text color.

Search modal. For the `local` provider, the search modal is rendered as a sub-view of the layout. For the `docsearch` provider, the Algolia DocSearch widget mounts its own modal into the `#docsearch-container` element in the navbar.

### Sub-view Mounting {#sub-view-mounting}

Child views are mounted in the layout template using the `v-swifty` attribute:

```html
<div v-swifty="theme/sidebar"></div>
<div v-swifty="theme/toc"></div>
<div v-swifty="theme/search"></div>
```

swifty-mvc resolves each reference to the corresponding registered view class and instantiates it.

## Responsive Breakpoints {#responsive-breakpoints}

The layout adapts to screen size using Tailwind's responsive prefixes. Two breakpoints control the visibility of the sidebar and table of contents.

| Breakpoint | Width     | Sidebar | TOC     | Navbar center |
| ---------- | --------- | ------- | ------- | ------------- |
| Default    | < 1024px  | Hidden  | Hidden  | Hidden        |
| `lg`       | >= 1024px | Visible | Hidden  | Visible       |
| `xl`       | >= 1280px | Visible | Visible | Visible       |

Sidebar visibility. The sidebar uses `hidden lg:block`. On screens narrower than 1024px, the sidebar is not rendered and the main content fills the full width.

Table of contents visibility. The TOC uses `hidden xl:block`. On screens between 1024px and 1280px, only the sidebar is visible. The TOC appears only on wider screens.

Navbar center. The top navigation links in `navbar-center` use `hidden lg:flex`. On mobile, only the site title and search button are visible.

### Sticky Positioning {#sticky-positioning}

Both the sidebar and the TOC use sticky positioning to remain visible as the user scrolls:

```
sticky top-11 h-[calc(100vh-2.75rem)]
```

The `top-11` offset (2.75rem) matches the navbar height. The calculated height subtracts the same offset from the viewport height so the panels fill the space below the navbar. Both panels have `overflow-y-auto` for independent scrolling when their content exceeds the available height.

The navbar itself uses `sticky top-0 z-50` with `backdrop-blur` to stay at the top of the page above all other content.

## Styling System {#styling-system}

All theme styles are expressed through Tailwind CSS utility classes with DaisyUI providing the component layer. No custom CSS files are shipped with the theme.

### DaisyUI Components {#daisyui-components}

The theme uses the following DaisyUI component classes:

| Component | Classes used                                                        | Where                                      |
| --------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Navbar    | `navbar`, `navbar-start`, `navbar-center`, `navbar-end`             | Top bar                                    |
| Menu      | `menu`, `menu-sm`, `menu-xs`, `menu-horizontal`, `menu-active`      | Sidebar, TOC, navbar links, search results |
| Button    | `btn`, `btn-ghost`, `btn-circle`, `btn-outline`, `btn-sm`, `btn-xs` | Search toggle, prev/next links, site title |
| Modal     | `modal`, `modal-open`, `modal-box`                                  | Search dialog                              |
| Input     | `input`, `input-sm`                                                 | Search text field                          |
| Kbd       | `kbd`, `kbd-xs`                                                     | Escape key hint in search modal            |

### Color Tokens {#color-tokens}

The theme uses DaisyUI's semantic color tokens exclusively. This means the entire color scheme adapts automatically when the active DaisyUI theme changes.

| Token                  | Usage                                           |
| ---------------------- | ----------------------------------------------- |
| `bg-base-100`          | Page background, navbar background              |
| `bg-base-200`          | Active TOC item background                      |
| `text-base-content`    | Primary text color                              |
| `text-base-content/60` | Secondary text (TOC items, search excerpts)     |
| `text-base-content/50` | Sidebar group headers                           |
| `text-base-content/40` | "No results" message                            |
| `text-base-content/30` | "No headings" and "Type to search" placeholders |
| `text-primary`         | Active sidebar item, active TOC item            |
| `bg-primary/10`        | Active sidebar item background                  |
| `border-base-200`      | Navbar bottom border, sidebar right border      |
| `border-base-300`      | Prev/next divider, search input border          |

### Prose Typography {#prose-typography}

The main content area uses Tailwind's Typography plugin via the `prose` and `prose-sm` classes. This provides consistent styling for Markdown-rendered HTML including headings, paragraphs, lists, code blocks, tables, and blockquotes.

```html
<article class="prose prose-sm max-w-none">{{!contentHtml}}</article>
```

The `max-w-none` modifier removes the default max-width constraint so the content fills the available column width.

## Icons {#icons}

Icons are managed through a centralized icon registry at `swifty-docs/theme/icons`. Each icon is imported as a raw SVG string from the `lucide-static` package at build time.

### Icon Registry {#icon-registry}

The current registry exports a single icon:

```ts
import search from "lucide-static/icons/search.svg?raw";

export const icons = { search };
```

The icons object is set once in view setup (not per-render) because icons are static data that never changes between renders:

```ts
ctx.updater.set({ icons: defaultIcons });
```

### Rendering Icons {#rendering-icons}

Icons are inserted into templates using the raw output operator `{{!}}`, which bypasses HTML escaping:

```html
<span class="h-3.5 w-3.5 [&>svg]:h-full [&>svg]:w-full">
  {{!icons.search}}
</span>
```

The wrapper `<span>` controls sizing through Tailwind utility classes. The `[&>svg]:h-full [&>svg]:w-full` selector ensures the child SVG element inherits the span's dimensions.

### Icon Color {#icon-color}

All Lucide icons use `currentColor` for their stroke and fill. Color is controlled by applying Tailwind text-color utilities on the wrapper element:

```html
<span class="h-3.5 w-3.5 text-current opacity-50 [&>svg]:h-full [&>svg]:w-full">
  {{!icons.search}}
</span>
```

This pattern allows icons to inherit the color of their surrounding context without modifying the SVG markup.

## Customization {#customization}

The built-in theme can be customized at several levels, from simple color changes to full view replacement.

### DaisyUI Theme Switching {#daisyui-theme-switching}

Because all color tokens are semantic DaisyUI tokens, switching the active DaisyUI theme in your Tailwind configuration changes the entire color scheme of the documentation site without modifying any theme source code.

```css
@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark,
    nord,
    dracula;
}
```

Every `bg-base-100`, `text-primary`, and `border-base-200` reference in the theme templates adapts to the selected DaisyUI theme automatically.

### View Factory Overrides {#view-factory-overrides}

Each theme view is created through an exported factory function. You can replace any view by registering your own implementation under the same namespace:

```ts
import { registerViewClass } from "swifty-mvc";
import { createSidebarView } from "swifty-docs/theme";

// Use the built-in factory with a custom template
registerViewClass("theme/sidebar", createSidebarView(myCompiledTemplate));

// Or provide an entirely custom view setup
registerViewClass("theme/sidebar", myCustomSidebarView);
```

The four factory functions are:

| Factory                          | Namespace           |
| -------------------------------- | ------------------- |
| `createDocsLayoutView(template)` | `theme/docs-layout` |
| `createSidebarView(template)`    | `theme/sidebar`     |
| `createTocView(template)`        | `theme/toc`         |
| `createSearchView(template)`     | `theme/search`      |

All factories accept a pre-compiled template (either string-mode or VDOM-mode) and return a `ViewSetup` object that swifty-mvc can instantiate.

### Icon Replacement {#icon-replacement}

The icons module is re-exported from the theme barrel. To replace an icon, import the icons object, override the entries you want to change, and pass the modified object to your custom view:

```ts
import { icons } from "swifty-docs/theme";
import customSearchSvg from "./my-search-icon.svg?raw";

const myIcons = { ...icons, search: customSearchSvg };
```

### Template Dual Mode {#template-dual-mode}

Templates are pre-compiled in both string and VDOM modes during the library build. `registerThemeViews()` selects the correct variant based on the `vdom` flag in your `FrameworkConfig`:

```ts
// After boot: vdom is auto-detected from FrameworkConfig
registerThemeViews();

// Before boot: pass vdom explicitly
registerThemeViews({ vdom: true });
```

When called after `Framework.boot()`, the function reads `FrameworkConfig.vdom` automatically. When called before boot, pass the option explicitly to avoid falling back to string mode.

### Search Provider Selection {#search-provider-selection}

The search experience is controlled by the `search.provider` option in `defineConfig`:

```ts
defineConfig({
  search: {
    provider: "local", // MiniSearch modal (default)
    // provider: "docsearch", // Algolia DocSearch UI with local index
    // provider: "none",      // Disable search entirely
  },
});
```

The `local` provider renders the search modal as a sub-view. The `docsearch` provider mounts the Algolia DocSearch widget into `#docsearch-container` but routes queries through a local search client backed by the pre-built index. No Algolia account or API key is required.

## See Also {#see-also}

- [Theme System](../guide/theme) -- detailed explanation of how each view works internally.
- [Configuration](../guide/configuration) -- full reference for `defineConfig` options.
- [Search](../guide/search) -- search index construction and provider options.
- [Sidebar](../guide/sidebar) -- sidebar generation and manual configuration.
