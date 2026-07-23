import { useEffect, useRef } from "preact/hooks";
import { z } from "zod";
import { useDocs } from "./context";
import { createLocalSearchClient } from "./docs-search-local";
import { SearchEntrySchema } from "./lib/content";

export function DocSearchWidget() {
  const docs = useDocs();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = docs.getSearchIndex ? await docs.getSearchIndex() : [];
      const parsed = z.array(SearchEntrySchema).safeParse(raw);
      const index = parsed.success ? parsed.data : [];
      const localClient = createLocalSearchClient(index);

      void import("@docsearch/css");
      try {
        const { default: docsearch } = await import("@docsearch/js");
        if (cancelled || !container.current) return;
        docsearch({
          container: container.current,
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
    return () => {
      cancelled = true;
    };
  }, [docs.getSearchIndex]);

  return <div id="docsearch-container" ref={container} />;
}
