/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as proceduralTexture from "procedural-textures/road/index";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
const globalObject = typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : undefined;
if (typeof globalObject !== "undefined") {
    for (const key in proceduralTexture) {
        (<any>globalObject).BABYLON[key] = (<any>proceduralTexture)[key];
    }
}

export * from "procedural-textures/road/index";
