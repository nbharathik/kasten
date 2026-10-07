import { createApi } from "./api.tsx";

const stage = document.getElementById("stage");
if (!stage) throw new Error("The render page has no stage to draw on.");

// The driver finds everything through this.
window.__render = createApi(stage);
