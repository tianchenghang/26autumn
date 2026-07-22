# Performance {#performance}

swifty-mvc is designed around the premise that a frontend framework should do the minimum amount of work necessary to keep the DOM in sync with application state. There is no virtual DOM by default, no reconciliation tree on every keystroke, and no re-execution of component bodies. Instead, the framework relies on compiled templates, per-view change detection, keyed real-DOM diffing, and cooperative time-slicing to deliver predictable frame rates even in large enterprise applications with hundreds of nested views.

This page explains the engineering decisions behind the framework's runtime performance, the trade-offs between the two rendering modes, and the practices you should follow to keep your application fast.

## Performance Design Decisions {#design-decisions}

Every subsystem in swifty-mvc was built with a specific performance budget in mind. The following sections describe how each subsystem avoids wasting cycles.

### Cooperative Time-Slicing {#cooperative-time-slicing}

Long-running JavaScript blocks starve the browser's event loop, causing janky scrolling, delayed input handling, and dropped animation frames. swifty-mvc solves this with a cooperative scheduler that breaks work into short batches and yields to the browser between them.

The scheduler in `utils.ts` processes a FIFO queue of deferred tasks. Each batch runs for up to 9ms (the `CALL_BREAK_TIME` constant), after which the scheduler yields control:

```ts
async function startCall(): Promise<void> {
  callScheduled = false;
  const startTime = performance.now();

  while (callQueue.length > 0) {
    const task = callQueue.shift()!;
    try {
      task();
    } catch (e) {
      console.error("scheduler task error:", e);
    }

    if (callQueue.length > 0 && performance.now() - startTime > 9) {
      if (schedulerYield) {
        await schedulerYield();
      } else {
        scheduleNextChunk();
        return;
      }
    }
  }
}
```

The yield strategy uses a two-tier approach. When `scheduler.yield()` is available, the scheduler pauses the current batch and resumes it after the browser processes higher-priority work, keeping all loop state intact across the pause. When `scheduler.yield()` is not available, the batch ends and a new one starts on the next `setTimeout(0)` tick.

A separate scheduler in `framework.ts` handles user-facing background task queuing with a 48ms budget and a different priority model. It uses a three-tier strategy: `scheduler.postTask` with background priority, `requestIdleCallback` with adaptive deadline-based chunk sizing, or `setTimeout(0)` as a universal fallback. This scheduler is exposed as `Framework.task()` and is appropriate for non-urgent work like analytics logging or deferred data processing.

```ts
// Queue a long-running operation for background processing
Framework.task(heavyComputation, [arg1, arg2]);
```

The internal scheduler (`callFunction` from `utils.ts`) is used by the framework itself to defer DOM callbacks such as `endUpdate`, `nodeProps` synchronization, and sub-view re-renders. This ensures that the synchronous DOM mutations complete first, and the browser can paint between the mutations and the post-processing.

### Iterative LIFO Stack Traversal {#iterative-lifo-traversal}

When the router or global state changes, the framework must walk the entire frame tree to notify views that observed the changed keys. A naive recursive walk would blow the JavaScript call stack on deeply nested frame hierarchies, and V8 does not perform tail-call optimization in practice.

The dispatcher in `framework.ts` uses an explicit LIFO stack instead:

```ts
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  const drain = (s: FrameObj[]): void => {
    while (s.length > 0) {
      const current = s.pop();
      if (!current) continue;
      const view = current.view;

      if (
        !view ||
        current.dispatcherUpdateTag === dispatcherUpdateTag ||
        view.signature.value <= 1
      ) {
        continue;
      }
      current.dispatcherUpdateTag = dispatcherUpdateTag;

      const isChanged = stateKeys
        ? stateIsObserveChanged(view, stateKeys)
        : viewIsObserveChanged(view);

      if (isChanged) {
        const renderResult = funcWithTry(
          view.renderMethod ?? view.render,
          [],
          view,
          noop,
        );
        if (isThenable(renderResult)) {
          renderResult.then(() => {
            const subStack: FrameObj[] = [];
            for (let i = children.length - 1; i >= 0; i--) {
              const child = Frame.get(children[i]);
              if (child) subStack.push(child);
            }
            drain(subStack);
          });
          continue;
        }
      }

      const children = current.children();
      for (let i = children.length - 1; i >= 0; i--) {
        const child = Frame.get(children[i]);
        if (child) s.push(child);
      }
    }
  };

  drain(stack);
}
```

Children are pushed in reverse order so that `pop()` visits them in the original declaration order. When a view's `render()` returns a promise (for async rendering), the subtree under that frame is deferred until the promise resolves, while sibling subtrees continue draining synchronously. A `dispatcherUpdateTag` counter prevents the same frame from being visited twice within a single update cycle.

### LFU Cache with O(n\*k) Eviction {#lfu-cache}

The service layer caches API responses using an LFU (Least Frequently Used) strategy implemented in `cache.ts`. Unlike LRU, which evicts the least recently accessed entry, LFU tracks an access frequency counter per entry and evicts the entries with the lowest frequency. This is strictly better for dashboard-style workloads where a handful of endpoints dominate the traffic pattern.

Each cache entry stores its frequency and last-access timestamp. On `get`, both values are bumped. When the cache grows beyond `maxSize + bufferSize`, eviction triggers:

```ts
function evictEntries(): void {
  const worst: CacheEntry<T>[] = [];

  for (const entry of entries) {
    if (worst.length < bufferSize) {
      let i = worst.length;
      while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
      worst.splice(i, 0, entry);
    } else if (comparator(entry, worst[bufferSize - 1]) > 0) {
      worst.pop();
      let i = worst.length;
      while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
      worst.splice(i, 0, entry);
    }
  }
  // ...remove worst entries from lookup and entries array
}
```

The eviction algorithm uses single-pass partial selection with complexity O(n\*k), where n is the number of entries and k is `bufferSize`. This is faster than sorting the entire array (O(n log n)) when k is small. For the typical `bufferSize = 5`, it is effectively a linear scan with at most 5 in-bucket comparisons per iteration.

```ts
const cache = createCache({ maxSize: 40, bufferSize: 10 });
cache.set("user-profile", userData);
const user = cache.get("user-profile"); // bumps frequency
```

### Reference-Counted Event Delegation {#reference-counted-events}

All DOM events in swifty-mvc are delegated to `document.body` in the capture phase. The `EventDelegator` in `event-delegator.ts` manages capture-phase listeners through reference counting so that multiple views registering the same event type do not attach duplicate listeners.

```ts
bind(eventType: string, hasSelector = false): void {
  const counter = rootEvents[eventType] || 0;
  if (counter === 0) {
    document.body.addEventListener(eventType, domEventProcessor, true);
  }
  rootEvents[eventType] = counter + 1;
  if (hasSelector) {
    selectorEvents[eventType] = (selectorEvents[eventType] || 0) + 1;
  }
}
```

The capture-phase listener is attached on the first `bind` call for a given event type and removed only when the counter returns to zero via `unbind`. This means that an application with 50 views all listening for `click` events has exactly one `click` listener on `document.body`, not 50.

Event information parsed from `@event` attributes is cached in an LFU cache (`eventInfoCache`) with `maxSize: 30` and `bufferSize: 10`, so repeated parsing of the same event attribute string is avoided.

### hrefCache and changedCache {#hrefcache-changedcache}

The router maintains internal caches for URL parsing and change detection. `hrefCache` memoizes the result of `parseUri()` so that repeated navigations to the same URL skip the regex-based parsing step. `changedCache` stores the diff between the previous and current location, computed once per navigation and reused by every view that calls `Router.diff()` during the same change cycle.

These caches are critical for route-change performance. When a navigation fires the `changed` event and the dispatcher walks a frame tree with 200 views, each view calls `Router.diff()` to check whether its observed parameters changed. Without `changedCache`, the diff would be recomputed 200 times. With it, the computation runs once and every view reads the cached result.

### mark/unmark with WeakMap {#mark-unmark-weakmap}

The `mark` and `unmark` functions in `mark.ts` provide signature-based lifecycle tracking for async callbacks. When a view initiates an async operation, it calls `mark(host, key)` to obtain a validity checker. When the view re-renders or is destroyed, `unmark(host)` invalidates all existing checkers. Stale callbacks that arrive after the view has moved on silently skip their work.

```ts
const hostStore = new WeakMap<object, HostRecord>();

export function mark(host: object, key: string): () => boolean {
  const record = getOrCreate(host);
  if (record.deleted) return () => false;
  const sign = (record.signs.get(key) ?? 0) + 1;
  record.signs.set(key, sign);
  return () => {
    const current = hostStore.get(host);
    return !!current && !current.deleted && current.signs.get(key) === sign;
  };
}
```

State is stored in a module-level `WeakMap`, not on the host object. This design choice has three consequences: it never pollutes user objects with magic properties, it never breaks on `Object.freeze`-ed inputs, and it never shows up in debug snapshots. The `WeakMap` also ensures that when a host object is garbage collected, its mark records are collected with it, preventing memory leaks.

The `wrapAsync` method on `ViewCtx` is built on top of `mark/unmark`, using the view's `signature` counter rather than a separate WeakMap entry:

```ts
const fetchData = ctx.wrapAsync(async () => {
  const res = await api.getData();
  ctx.updater.digest({ data: res });
});
```

## String Mode vs VDOM Mode {#string-mode-vs-vdom-mode}

swifty-mvc ships two rendering pipelines. The default is string mode, which compiles templates to functions that return HTML strings. The opt-in alternative is VDOM mode, which compiles templates to functions that return virtual DOM node trees. Each mode has distinct performance characteristics.

### String Mode (Default) {#string-mode}

In string mode, the compiled template function produces an HTML string. The updater parses this string into a temporary DOM tree via `document.implementation.createHTMLDocument`, then diffs it against the live DOM using keyed comparison.

The string rendering path in `updater.ts`:

```ts
const result = template(
  data,
  viewId,
  refData,
  encodeHTML,
  strSafe,
  encodeURIExtra,
  refFn,
  encodeQuote,
);

if (typeof result === "string") {
  const newDom = domGetNode(result, node);
  const ref = createDomRef();
  domSetChildNodes(node, newDom, ref, frame, keys);
  applyIdUpdates(ref.idUpdates);
  applyDomOps(ref.domOps);
}
```

String mode is fast for the majority of view updates because:

The compiled template function is a straight-line sequence of string concatenations. There are no object allocations for virtual nodes, no tree construction overhead, and no recursive diffing of nested vnode structures.

The HTML string is parsed by the browser's native HTML parser via `innerHTML` on a temporary element in a detached document. Native parsing is highly optimized in all major browsers and handles special elements (table, SVG, MathML) correctly without custom parsing logic.

The keyed diff in `dom.ts` compares the live DOM against the parsed tree, collecting DOM operations into a batch (`ref.domOps`). All mutations are applied in a single pass after the diff completes, which minimizes layout thrashing.

String mode is the right default for views where most of the template re-renders on each update, where the view has a flat or moderately nested structure, and where the data changes drive wholesale re-rendering of sections.

### VDOM Mode (Opt-in) {#vdom-mode}

VDOM mode is enabled per-view by setting `vdom: true` in the framework configuration or by returning a VDOM template from the setup function. The compiled template produces a `VDomNode` tree via `vdomCreate`, which is then diffed against the previous tree using a three-phase algorithm with LIS-based reconciliation.

The VDOM rendering path in `updater.ts`:

```ts
const result = template(
  data,
  viewId,
  refData,
  encodeHTML,
  strSafe,
  encodeURIExtra,
  refFn,
  encodeQuote,
);

if (typeof result !== "string") {
  const newVDom = result;
  const ref = createVDomRef(viewId);
  const ready = (): void => {
    vdom = newVDom;
    if (ref.changed || !view.rendered.value) {
      view.endUpdate(viewId);
    }
    for (const [el, prop, val] of ref.nodeProps) {
      Reflect.set(el, prop, val);
    }
  };
  vdomSetChildNodes(node, vdom, newVDom, ref, frame, keys, view, ready);
}
```

VDOM mode carries overhead that string mode avoids: every render allocates a tree of `VDomNode` objects, and the diff must walk both trees recursively. However, it provides two advantages that matter for specific workloads.

First, VDOM mode can detect that a subtree is unchanged by comparing serialized attribute strings and innerHTML content. When `lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html`, the entire subtree is skipped without walking its children. This fast path is particularly effective for views with large, mostly-static subtrees where only a few leaf nodes change.

Second, VDOM mode uses the LIS algorithm to minimize DOM move operations when reordering keyed children. If you have a sortable list where items move around frequently, VDOM mode produces fewer DOM mutations than string mode's keyed diff.

### When to Choose Each Mode {#choosing-rendering-mode}

Use string mode for the vast majority of your views. It is faster for initial renders, has lower memory overhead, and produces correct results for all standard use cases.

Switch to VDOM mode only when profiling shows that a specific view benefits from it. Typical candidates include views with deeply nested dynamic content where the attrs+html fast path eliminates most of the recursive diff, views with frequently reordered keyed children where LIS reduces DOM moves, and views that perform frequent partial updates on large static subtrees.

## Minimizing DOM Operations with Keyed Diff {#keyed-diff}

The string-mode diff engine in `dom.ts` uses a keyed comparison algorithm to reuse existing DOM nodes rather than destroying and recreating them. This is the primary mechanism that keeps re-renders cheap.

### Compare Key Resolution {#compare-key-resolution}

Every element node can carry a compare key, which the diff uses to match old nodes to new nodes across renders. The key is resolved by `domGetCompareKey`:

```ts
export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const el = node as DomElement;

  if (el.compareKeyCached) return el.cachedCompareKey;

  let key = el.autoId ? "" : el.getAttribute("id") || undefined;
  if (!key) {
    const swiftyView = el.getAttribute(SWIFTY_VIEW);
    if (swiftyView) {
      key = parseUri(swiftyView).path || undefined;
    }
  }

  el.compareKeyCached = 1;
  el.cachedCompareKey = key || "";
  return key;
}
```

The compare key is the element's `id` attribute, or the `v-swifty` path for embedded views. Keys are cached on the DOM element itself to avoid repeated attribute reads. The cache is invalidated during `domSetAttributes` when the element's attributes change.

### The Keyed Diff Algorithm {#keyed-diff-algorithm}

`domSetChildNodes` builds a `keyedNodes` map from old children (bucketed by compare key), then walks new children trying to reuse old nodes by key:

```ts
const keyedNodes = new Map<string, ChildNode[]>();
const newKeyedNodes = new Map<string, number>();

// Build map from old children
while (oldNode) {
  const nodeKey = domGetCompareKey(oldNode);
  if (nodeKey) {
    let bucket = keyedNodes.get(nodeKey);
    if (!bucket) {
      bucket = [];
      keyedNodes.set(nodeKey, bucket);
    }
    bucket.push(oldNode);
  }
  oldNode = oldNode.previousSibling;
}
```

For each new child, the algorithm checks whether a keyed match exists. If it does, the matched old node is diffed in place via `domSetNode`, which recursively diffs attributes and children. If the old node is not at the expected position, it is moved via `appendChild` (which relocates an existing child rather than inserting a new one).

Unmatched old nodes are removed, and unmatched new nodes are appended. DOM operations are collected into a `domOps` array and applied in a single batch after the diff completes:

```ts
export function applyDomOps(ops: DomOp[]): void {
  for (const op of ops) {
    switch (op[0]) {
      case 1:
        op[1].appendChild(op[2]);
        break;
      case 2:
        op[1].removeChild(op[2]);
        break;
      case 4:
        op[1].replaceChild(op[2], op[3]);
        break;
      case 8:
        op[1].insertBefore(op[2], op[3]);
        break;
    }
  }
}
```

Batching mutations this way avoids intermediate layout recalculations that would occur if each operation were applied immediately.

### ID Updates Are Deferred {#deferred-id-updates}

Changing an element's `id` attribute mid-diff would invalidate `frameGetter` lookups for subsequent sibling nodes, because the framework resolves frame references by element ID. To avoid this, ID changes are collected into a separate `idUpdates` array and applied after the diff completes:

```ts
export function applyIdUpdates(updates: [Element, string][]): void {
  for (const [element, newId] of updates) {
    if (newId) {
      element.setAttribute("id", newId);
    } else {
      element.removeAttribute("id");
    }
  }
}
```

### isEqualNode Short-Circuit {#isequalnode-short-circuit}

Before performing an attribute-by-attribute diff, `domSetNode` calls `isEqualNode` on the two nodes. If the native comparison returns true, the nodes are structurally identical and the entire diff is skipped:

```ts
const equalAsNodes =
  oldAsEl !== null &&
  newAsEl !== null &&
  oldAsEl.isEqualNode &&
  oldAsEl.isEqualNode(newAsEl);

if (domSpecialDiff(oldNode, newNode) || !equalAsNodes) {
  // proceed with diff
}
```

`isEqualNode` is implemented natively in the browser and is significantly faster than a JavaScript-level attribute comparison for large subtrees. The only exception is form elements, where `domSpecialDiff` must still run to sync DOM properties (value, checked, selected) that are not reflected in attributes.

## LIS Algorithm in VDOM Mode {#lis-algorithm}

The VDOM reconciler in `vdom.ts` uses a three-phase diff algorithm for child node reconciliation. The first two phases are fast paths that handle the common cases. The third phase uses the Longest Increasing Subsequence algorithm to minimize DOM move operations.

### Phase 1: Head Fast-Path {#phase-1-head}

Match identical nodes from the start of both old and new children arrays. These nodes are already in the correct position, so no DOM moves are needed. Only in-place updates via `vdomSetNode` are applied:

```ts
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren![headIdx];
  const nc = newChildren![newHead];
  if (!isSameVDomNode(nc, oc)) break;
  if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

  vdomSetNode(
    oldDomNodes[headIdx],
    realNode,
    oc,
    nc,
    ref,
    frame,
    keys,
    view,
    ready,
  );
  usedOldDomNodes.add(oldDomNodes[headIdx]);
  headIdx++;
  newHead++;
}
```

### Phase 2: Tail Fast-Path {#phase-2-tail}

Match identical nodes from the end of both arrays. Like the head fast-path, no DOM moves are needed:

```ts
while (headIdx <= tailIdx && newHead <= newTail) {
  const oc = oldChildren![tailIdx];
  const nc = newChildren![newTail];
  if (!isSameVDomNode(nc, oc)) break;
  if (nc.tag === SPLITTER || oc.tag === SPLITTER) break;

  vdomSetNode(
    oldDomNodes[tailIdx],
    realNode,
    oc,
    nc,
    ref,
    frame,
    keys,
    view,
    ready,
  );
  usedOldDomNodes.add(oldDomNodes[tailIdx]);
  tailIdx--;
  newTail--;
}
```

For many real-world updates (adding an item to the beginning or end of a list, updating a single row in a table), phases 1 and 2 handle the entire diff without entering phase 3.

### Phase 3: LIS Reconciliation {#phase-3-lis}

When the fast paths cannot match all remaining children, phase 3 builds a key-to-node index from the remaining old children, then computes the Longest Increasing Subsequence of old indices within the new children's ordering.

The `computeLIS` function uses patience sorting with binary search for O(n log n) performance:

```ts
function computeLIS(sequence: number[]): number[] {
  const len = sequence.length;
  if (len === 0) return [];

  const result: number[] = [];
  const tails: number[] = [];
  const predecessors: number[] = new Array(len);
  let lisLength = 0;

  for (let i = 0; i < len; i++) {
    const value = sequence[i];
    if (value < 0) continue; // skip unmatched entries

    let lo = 0;
    let hi = lisLength;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sequence[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = i;
    predecessors[i] = lo > 0 ? tails[lo - 1] : -1;
    if (lo === lisLength) lisLength++;
  }

  let cursor = tails[lisLength - 1];
  for (let i = lisLength - 1; i >= 0; i--) {
    result[i] = cursor;
    cursor = predecessors[cursor];
  }

  return result;
}
```

The LIS identifies the largest subset of nodes that are already in the correct relative order. These nodes stay in place. All other matched nodes are moved via `insertBefore`, and unmatched nodes (those with no corresponding old node) are created fresh. If the LIS length is L and there are N remaining new children, at most N - L move operations are needed.

The iteration proceeds backward through remaining new children. A `nextNode` reference serves as the insertion anchor, updated after each processed node so that the next iteration inserts at the correct position:

```ts
let nextNode: ChildNode | null =
  tailIdx + 1 < oldLen ? oldDomNodes[tailIdx + 1] : null;

for (let j = newRemaining - 1; j >= 0; j--) {
  const nc = newChildren![newHead + j];

  if (lisCursor >= 0 && lis[lisCursor] === j) {
    // In the LIS: update in place, no DOM move
    vdomSetNode(
      oldDomNodes[oldIdx],
      realNode,
      oldChildren![oldIdx],
      nc,
      ref,
      frame,
      keys,
      view,
      ready,
    );
    nextNode = oldDomNodes[oldIdx];
    lisCursor--;
  } else if (sequence[j] >= 0) {
    // Matched but not in LIS: move to correct position
    realNode.insertBefore(oldDomNodes[oldIdx], nextNode);
    vdomSetNode(
      oldDomNodes[oldIdx],
      realNode,
      oldChildren![oldIdx],
      nc,
      ref,
      frame,
      keys,
      view,
      ready,
    );
    nextNode = oldDomNodes[oldIdx];
  } else {
    // New node: create and insert
    const newNode = vdomCreateNode(nc, realNode, ref);
    realNode.insertBefore(newNode, nextNode);
    nextNode = newNode;
  }
}
```

### attrs+html Fast Path in VDOM Mode {#vdom-fast-path}

Before entering the recursive child diff, `vdomSetNode` checks whether the serialized opening tag (`attrs`) and serialized innerHTML (`html`) are identical between old and new VDomNodes. When both match, neither attributes nor children changed, and the entire subtree is skipped:

```ts
if (lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html) {
  if (newVDom.hasSpecials) {
    vdomSyncFormState(realNode, newVDom);
  }
  return;
}
```

This is a string equality check, which is O(n) in the length of the strings but avoids the far more expensive O(children) recursive diff and attribute iteration. For views where most subtrees are static between renders, this fast path eliminates the majority of the diff work.

## Lazy Initialization Patterns {#lazy-initialization}

swifty-mvc defers work until it is actually needed, avoiding upfront costs for features that may never be used.

### View Setup Runs Once {#setup-runs-once}

The setup function returned by `defineView` executes exactly once when the view mounts. It does not re-run on every render. This means that all closure captures, hook registrations, and event handler definitions happen a single time. Subsequent re-renders only invoke the compiled template function and the optional `assign` method.

### Lazy Frame Creation {#lazy-frame-creation}

Child frames are not created until the parent view's template output contains `v-swifty` elements. The `mountZone` function scans the rendered DOM for unbound `v-swifty` elements and creates child frames on demand. If a parent view's template does not embed any child views, no frame allocation occurs.

### Deferred DOM Callbacks {#deferred-dom-callbacks}

The `callFunction` scheduler defers `endUpdate`, `nodeProps` synchronization, and sub-view re-renders to the next scheduler batch. This means that synchronous DOM mutations complete first, and the browser can process events and paint between the mutations and the post-processing. For large updates that span multiple scheduler batches, this prevents long tasks from blocking user interaction.

### Module Loading on Demand {#module-loading-on-demand}

Views are loaded asynchronously through the configured `require` function. The framework does not eagerly load all view modules at boot time. When the router navigates to a new route, the required view module is loaded via dynamic import. Subsequent navigations to the same route reuse the cached module.

### Incremental Counter-Based Versioning {#counter-versioning}

The updater tracks data changes with a monotonically increasing `version` counter. Each `set` call that produces an actual change bumps the version. The `snapshot` and `altered` methods compare version numbers rather than performing deep equality checks on data objects:

```ts
function snapshot(): UpdaterApi {
  snapshotVersion = version;
  return api;
}

function altered(): boolean | undefined {
  if (snapshotVersion === undefined) return undefined;
  return version !== snapshotVersion;
}
```

This makes change detection O(1) regardless of the size of the data object.

## Best Practices {#best-practices}

The following practices help you get the best performance out of the framework.

### Declare Observed Keys Precisely {#precise-observation}

`ctx.observeLocation` and `ctx.observeState` determine which views re-render when the URL or global state changes. Over-declaring observed keys causes unnecessary re-renders. Under-declaring causes stale data.

```ts
// Good: only observe what this view actually uses
ctx.observeLocation(["page", "filter"]);
ctx.observeState("currentUser");

// Bad: observing everything forces re-renders on any change
ctx.observeLocation(["page", "filter", "sort", "q", "date", "category"]);
```

### Use useState Getters to Avoid Stale Closures {#usestate-getters}

The getter returned by `useState` always reads the current value from `updater.data`. This avoids the stale closure problem that plagues frameworks where state is captured by value:

```ts
const [getCount, setCount] = useState("count", 0);

// Good: getCount() always returns the current value
const handleClick = () => setCount(getCount() + 1);

// Bad: capturing the value creates a stale reference
const currentCount = getCount();
const handleClick = () => setCount(currentCount + 1);
```

### Batch State Updates {#batch-state-updates}

Multiple calls to `updater.set` within the same synchronous block are batched. The `digest` call at the end triggers a single re-render with all accumulated changes. Avoid calling `digest` after every `set`:

```ts
// Good: batch multiple sets, digest once
ctx.updater.set({ name: "Alice" });
ctx.updater.set({ age: 30 });
ctx.updater.set({ email: "alice@example.com" });
ctx.updater.digest();

// Bad: three separate renders
ctx.updater.digest({ name: "Alice" });
ctx.updater.digest({ age: 30 });
ctx.updater.digest({ email: "alice@example.com" });
```

### Provide Keys for List Items {#keys-for-lists}

When rendering lists of elements, give each item a stable `id` attribute. The keyed diff uses these IDs to match old nodes to new nodes, avoiding unnecessary DOM destruction and recreation:

```html
{{each items as item}}
<div id="item-{{item.id}}" class="list-item">{{item.name}}</div>
{{/each}}
```

Without stable keys, the diff falls back to positional matching, which means that inserting an item at the beginning of the list causes every subsequent item to be diffed against the wrong old node.

### Clean Up Resources {#clean-up-resources}

Always use `ctx.capture` for resources that need cleanup, or `useEffect` with a destroy function. Leaked intervals, event listeners, and subscriptions accumulate over time and degrade performance:

```ts
// Good: automatic cleanup on view destroy
useEffect(() => {
  const timer = setInterval(poll, 5000);
  return () => clearInterval(timer);
});

// Good: capture with destroy
ctx.capture("pollTimer", {
  destroy() {
    clearInterval(timer);
  },
});

// Bad: leaked interval
setInterval(poll, 5000);
```

### Use wrapAsync for Async Operations {#use-wrapasync}

`ctx.wrapAsync` captures the current signature and silently drops callbacks that arrive after the view has re-rendered or been destroyed. This prevents wasted work and avoids errors from updating a destroyed view:

```ts
const loadData = ctx.wrapAsync(async () => {
  const res = await fetch("/api/data");
  const data = await res.json();
  ctx.updater.digest({ data });
});
```

### Prefer State.clean for Shared Keys {#prefer-state-clean}

When a view reads a key from `State`, register cleanup with `State.clean` so the key's data is reclaimed when the last observer is destroyed:

```ts
defineView("profile", (ctx) => {
  State.clean("user")(ctx);
  // The "user" key is automatically deleted from State
  // when this view (and every other observer) is destroyed.
});
```

## Memory Management {#memory-management}

swifty-mvc uses signature-based lifecycle tracking to manage memory across view lifecycles. The goal is to ensure that when a view is destroyed, every resource it owns is released, and no stale references prevent garbage collection.

### Signature Counter {#signature-counter}

Every `ViewCtx` carries a mutable `signature` reference cell. Its value is greater than zero while the view is alive and is set to zero on destroy. It is incremented on every render. This counter is the mechanism behind `wrapAsync` and stale-callback prevention:

```ts
if (ctx.signature.value > 0) {
  // view is still alive
}
```

When `unmountCtx` runs, it sets `signature.value = 0`. After this point, `render()` is a no-op, `wrapAsync` wrappers silently skip their bodies, and any deferred callbacks that reference the view find a zero signature and bail out.

### Resource Capture and Release {#resource-capture-release}

`ctx.capture(key, resource)` stores a destroyable resource on the view context. When the view is destroyed, every captured resource's `destroy()` method is called. Resources marked `destroyOnRender = true` are additionally destroyed on each re-render:

```ts
ctx.capture("websocket", {
  destroy() {
    ws.close();
  },
  destroyOnRender: false, // survives re-renders
});

ctx.capture("tempSubscription", {
  destroy() {
    sub.unsubscribe();
  },
  destroyOnRender: true, // destroyed on each re-render
});
```

If `capture` is called with an existing key, the old resource's `destroy()` is called before the new one replaces it. This prevents accumulation of stale resources under the same key.

### Effect Cleanup Order {#effect-cleanup-order}

`useEffect` cleanups run in reverse registration order during the unmount phase. This ensures that effects registered later (which may depend on earlier effects) are torn down first:

```ts
function unmountCtx(ctx) {
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    ctx.cleanups[i]();
  }
  unregisterEvents(ctx);
  destroyAllResources(ctx, true);
  ctx.signature.value = 0;
}
```

### Event Listener Cleanup {#event-listener-cleanup}

During mount, `registerEvents` parses the `events` map and binds DOM event listeners through the `EventDelegator`. During unmount, `unregisterEvents` decrements the reference counters for each event type. When the counter for an event type reaches zero, the capture-phase listener is removed from `document.body`. Range events scoped to the destroyed frame are cleared via `EventDelegator.clearRangeEvents(ctx.id)`.

### Frame Tree Cleanup {#frame-tree-cleanup}

When a parent view is destroyed, all child frames are recursively unmounted. When a parent re-renders and its new template output no longer contains a child's mount element, that child frame is unmounted. The frame's view context is destroyed, its resources are released, and its entry is removed from the parent's `childrenMap`.

### WeakMap-Based State {#weakmap-state}

The `mark/unmark` system stores its state in a module-level `WeakMap`. When a host object (typically a view context) becomes unreachable and is garbage collected, its mark records are collected with it. There is no need for explicit cleanup of mark state, and no risk of mark entries accumulating over time.

### State Key Reference Counting {#state-key-refcounting}

`State.clean` uses reference counting to determine when a shared key can be safely deleted. Each observer increments the count on registration and decrements it on destroy. When the count reaches zero, both the key and its value are removed from the state object:

```ts
function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      const count = --keyRefCounts[key];
      if (count <= 0) {
        Reflect.deleteProperty(keyRefCounts, key);
        Reflect.deleteProperty(appData, key);
      }
    }
  }
}
```

This prevents the common memory leak pattern where shared state grows unboundedly as views mount and unmount without cleaning up their contributions.
