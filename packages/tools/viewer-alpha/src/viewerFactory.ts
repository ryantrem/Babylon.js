// eslint-disable-next-line import/no-internal-modules
import type { AbstractEngine, AbstractEngineOptions, EngineOptions, WebGPUEngineOptions } from "core/index";
import { Constants } from "core/Engines/constants";

import type { ViewerOptions } from "./viewer";
import { Viewer } from "./viewer";

/**
 * Options for creating a Viewer instance that is bound to an HTML canvas.
 */
export type CanvasViewerOptions = ViewerOptions &
    (({ engine?: undefined } & AbstractEngineOptions) | ({ engine: "WebGL" } & EngineOptions) | ({ engine: "WebGPU" } & WebGPUEngineOptions));
const defaultCanvasViewerOptions: CanvasViewerOptions = {};

/**
 * Chooses a default engine for the current browser environment.
 * @returns The default engine to use.
 */
export function getDefaultEngine(): NonNullable<CanvasViewerOptions["engine"]> {
    // TODO: When WebGPU is fully production ready, we may want to prefer it if it is supported by the browser.
    return "WebGL";
}

/**
 * Creates a Viewer instance that is bound to an HTML canvas.
 * @remarks
 * This function can be shared across multiple UI integrations (e.g. Web Components, React, etc.).
 * @param canvas The canvas element to bind the Viewer to.
 * @param options The options to use when creating the Viewer and binding it to the specified canvas.
 * @returns A Viewer instance that is bound to the specified canvas.
 */
export async function createViewerForCanvas(canvas: HTMLCanvasElement, options?: CanvasViewerOptions): Promise<Viewer> {
    const finalOptions = { ...defaultCanvasViewerOptions, ...options };
    const disposeActions: (() => void)[] = [];

    // If the canvas is resized, note that the engine needs a resize, but don't resize it here as it will result in flickering.
    let needsResize = false;
    const resizeObserver = new ResizeObserver(() => (needsResize = true));
    resizeObserver.observe(canvas);
    disposeActions.push(() => resizeObserver.disconnect());

    // Create an engine instance.
    let engine: AbstractEngine;
    switch (finalOptions.engine ?? getDefaultEngine()) {
        case "WebGL": {
            // eslint-disable-next-line @typescript-eslint/naming-convention, no-case-declarations
            const { Engine } = await import("core/Engines/engine");
            engine = new Engine(canvas, undefined, options);
            break;
        }
        case "WebGPU": {
            // eslint-disable-next-line @typescript-eslint/naming-convention, no-case-declarations
            const { WebGPUEngine } = await import("core/Engines/webgpuEngine");
            const webGPUEngine = new WebGPUEngine(canvas, options);
            await webGPUEngine.initAsync();
            engine = webGPUEngine;
            break;
        }
    }

    // Override the onInitialized callback to add in some specific behavior.
    const onInitialized = finalOptions.onInitialized;
    finalOptions.onInitialized = (details) => {
        const beforeRenderObserver = details.scene.onBeforeRenderObservable.add(() => {
            // Resize if needed right before rendering the Viewer scene to avoid any flickering.
            if (needsResize) {
                engine.resize();
                needsResize = false;
            }

            // If snapshot rendering is enabled, transfer the updated skybox world matrix to the effect.
            if (engine.snapshotRendering && engine.snapshotRenderingMode === Constants.SNAPSHOTRENDERING_FAST) {
                details.skybox?.transferToEffect(details.skybox.computeWorldMatrix(true));
                details.model?.skeletons.forEach((skeleton) => skeleton.prepare());
            }
        });
        disposeActions.push(() => beforeRenderObserver.remove());

        // Helper to suspend snapshot rendering during operations that change the scene.
        let snapshotRenderingDisableCount = 0;
        const suspendSnapshotRendering = async <T>(operation: () => Promise<T>) => {
            snapshotRenderingDisableCount++;
            engine.snapshotRendering = false;

            try {
                return await operation();
            } finally {
                snapshotRenderingDisableCount--;
                details.scene.executeWhenReady(() => {
                    if (snapshotRenderingDisableCount === 0) {
                        engine.snapshotRenderingMode = Constants.SNAPSHOTRENDERING_FAST;
                        engine.snapshotRendering = true;
                    }
                });
            }
        };

        // Suspend snapshot rendering while loading a model.
        const originalLoadModel: typeof details.viewer.loadModel = details.viewer.loadModel.bind(details.viewer);
        details.viewer.loadModel = async (...args) => suspendSnapshotRendering(() => originalLoadModel(...args));

        // Suspend snapshot rendering while loading an environment.
        const originalLoadEnvironment: typeof details.viewer.loadEnvironment = details.viewer.loadEnvironment.bind(details.viewer);
        details.viewer.loadEnvironment = async (...args) => suspendSnapshotRendering(() => originalLoadEnvironment(...args));

        // Call the original onInitialized callback, if one was provided.
        onInitialized?.(details);
    };

    // Instantiate the Viewer with the engine and options.
    const viewer = new Viewer(engine, finalOptions);
    disposeActions.push(viewer.dispose.bind(viewer));

    disposeActions.push(() => engine.dispose());

    // Override the Viewer's dispose method to add in additional cleanup.
    viewer.dispose = () => disposeActions.forEach((dispose) => dispose());

    return viewer;
}
