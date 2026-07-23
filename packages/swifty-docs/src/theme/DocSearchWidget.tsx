import { onMount } from "solid-js";
import { z } from "zod";
import { useDocs } from "./context";
import { createLocalSearchClient } from "./docs-search-local";
import { SearchEntrySchema } from "./lib/content";

/**
 * Algolia DocSearch widget backed by the local search index (no Algolia
 * account required). Mounted in the navbar when provider === "docsearch".
 */
export function DocSearchWidget() {
  const docs = useDocs();
  let container: HTMLDivElement | undefined;

  onMount(() => {
    void (async () => {
      const raw = docs.getSearchIndex ? await docs.getSearchIndex() : [];
      const parsed = z.array(SearchEntrySchema).safeParse(raw);
      const index = parsed.success ? parsed.data : [];
      const localClient = createLocalSearchClient(index);

      void import("@docsearch/css");
      try {
        const { default: docsearch } = await import("@docsearch/js");
        if (!container) return;
        docsearch({
          container,
          // Dummy credentials — queries are routed to the local index via
          // transformSearchClient below.
          appId: "local",
          apiKey: "local",
          indexName: "local",
          transformSearchClient: (client) =>
            new Proxy(client, {
              get(target, prop, receiver) {
                if (prop === "search") return localClient.search;
                return Reflect.get(target, prop, receiver);
              },
            }),
        });
      } catch (e) {
        console.warn("[@swifty.js/docs] Failed to initialize DocSearch:", e);
      }
    })();
  });

  return <div id="docsearch-container" ref={container} />;
}
