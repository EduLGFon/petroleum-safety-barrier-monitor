// Shared Fresh helpers - defines typed context state for middlewares/routes.
// This is why it exists: one typed `define` used by every route file.
import { createDefine } from "fresh";

// Shared request state passed through middlewares, layouts and routes.
export interface State {
  shared?: string;
}

export const define = createDefine<State>();
