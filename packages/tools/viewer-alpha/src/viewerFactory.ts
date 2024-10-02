// eslint-disable-next-line import/no-internal-modules
import type { AbstractEngine, AbstractEngineOptions, EngineOptions, Nullable, WebGPUDrawContext, WebGPUEngineOptions, WebGPUShaderProcessor } from "core/index";
import type { WebGPUPipelineContext } from "core/Engines/WebGPU/webgpuPipelineContext";
import { Constants } from "core/Engines/constants";
import { BindMorphTargetParameters } from "core/Materials/materialHelper.functions";

import type { ViewerDetails, ViewerOptions } from "./viewer";
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
    let engineSpecificOnBeforeRender: Nullable<(details: Readonly<ViewerDetails>) => void> = null;
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

            engineSpecificOnBeforeRender = (details) => {
                if (engine.snapshotRendering && engine.snapshotRenderingMode === Constants.SNAPSHOTRENDERING_FAST) {
                    // Handle morph targets.
                    if (details.model) {
                        for (const mesh of details.model.meshes) {
                            if (mesh.morphTargetManager) {
                                for (const subMesh of mesh.subMeshes) {
                                    const drawContext = subMesh._drawWrapper.drawContext as WebGPUDrawContext | undefined;
                                    const effect = subMesh._drawWrapper.effect;
                                    const pipelineContext = effect?._pipelineContext;
                                    if (drawContext && effect && pipelineContext) {
                                        const webGPUPipelineContext = pipelineContext as WebGPUPipelineContext;
                                        const dataBuffer = drawContext.buffers["LeftOver" satisfies (typeof WebGPUShaderProcessor)["LeftOvertUBOName"]];
                                        const ubLeftOver = webGPUPipelineContext.uniformBuffer;
                                        if (dataBuffer && ubLeftOver?.setDataBuffer(dataBuffer)) {
                                            mesh.morphTargetManager._bind(effect);
                                            BindMorphTargetParameters(mesh, effect);
                                            ubLeftOver.update();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

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

            // If snapshot rendering is enabled, there are some additional steps needed to ensure everything renders correctly.
            if (engine.snapshotRendering && engine.snapshotRenderingMode === Constants.SNAPSHOTRENDERING_FAST) {
                if (details.skybox) {
                    // Handle skybox.
                    details.skybox.transferToEffect(details.skybox.computeWorldMatrix(true));
                }

                if (details.model) {
                    // Handle skeletons.
                    details.model.skeletons.forEach((skeleton) => skeleton.prepare());
                    for (const mesh of details.model.meshes) {
                        if (mesh.skeleton) {
                            const world = mesh.computeWorldMatrix(true);
                            mesh.transferToEffect(world);
                        }
                    }
                }
            }

            engineSpecificOnBeforeRender?.(details);
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
                    // Wait for the next frame to render before enabling snapshot rendering again.
                    const targetFrame = details.scene.getEngine().frameId + 2;
                    const endFrameObserver = details.scene.getEngine().onEndFrameObservable.add(() => {
                        if (details.scene.getEngine().frameId >= targetFrame) {
                            endFrameObserver.remove();
                            if (snapshotRenderingDisableCount === 0) {
                                engine.snapshotRenderingMode = Constants.SNAPSHOTRENDERING_FAST;
                                engine.snapshotRendering = true;
                            }
                        }
                    });
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
