import { register as action } from "./action.ts";
import { register as router } from "./router.ts";
import { doc, subEvent } from "./util.ts";

import "./lifecycle.ts";

subEvent(doc, "DOMContentLoaded", () => {
  action();
  router();
});
