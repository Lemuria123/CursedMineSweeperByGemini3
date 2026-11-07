import fs from "node:fs";
import { decodePng } from "../src/image";
import { detectOverlay } from "../src/vision/overlay";
for (const f of ["logs/debug-gear2/02-settings1.png","logs/debug-gear2/04-after-gear2.png"]) {
  console.log(f, JSON.stringify(detectOverlay(decodePng(fs.readFileSync(f)))));
}
