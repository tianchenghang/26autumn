declare module "*.html" {
  import type { ViewTemplate, VDomTemplate } from "swifty-next";

  const template: ViewTemplate | VDomTemplate;
  export default template;
}
