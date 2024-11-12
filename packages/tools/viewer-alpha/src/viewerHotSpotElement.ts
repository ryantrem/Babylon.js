// eslint-disable-next-line import/no-internal-modules
import type { IDisposable, Nullable, Observer, Scene } from "core/index";

import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "core/Rendering/depthRendererSceneComponent";
import { Vector3 } from "core/Maths/math.vector";
import { HTML3DElement } from "./viewerElement";
import { ViewerHotSpotResult } from "./viewer";

@customElement("babylon-viewer-hotspot")
export class HTMLHotSpotElement extends LitElement {
    // eslint-disable-next-line @typescript-eslint/naming-convention, jsdoc/require-jsdoc
    static override styles = css`
        :host {
            display: inline-block;
        }
    `;

    private _viewerAttachment: Nullable<IDisposable> = null;

    @property({ attribute: "hotspot-name" })
    public hotSpotName: string = "";

    @state()
    private _isValid = false;

    // eslint-disable-next-line babylonjs/available
    override connectedCallback(): void {
        super.connectedCallback();
        if (!(this.parentElement instanceof HTML3DElement)) {
            // eslint-disable-next-line no-console
            console.warn("The babylon-viewer-hotspot element must be a child of a babylon-viewer element.");
            return;
        }

        const viewerElement = this.parentElement;
        const hotSpotResult = new ViewerHotSpotResult();
        let depthRendererRegistration: Nullable<IDisposable> = null;
        let sceneRenderObserver: Nullable<Observer<Scene>> = null;
        const registerSceneRender = () => {
            sceneRenderObserver?.remove();
            sceneRenderObserver = null;

            if (viewerElement.viewerDetails) {
                const { scene, camera } = viewerElement.viewerDetails;
                const depthRenderer = scene.enableDepthRenderer(camera, undefined, undefined, undefined, true);
                const depthTexture = depthRenderer.getDepthMap();
                // TODO: depthTexture.renderList = viewerElement.viewerDetails.model?.meshes
                const readPixelsBuffer = new Float32Array(1);
                depthRendererRegistration = {
                    dispose() {
                        scene.disableDepthRenderer(camera);
                    },
                };

                sceneRenderObserver = viewerElement.viewerDetails.scene.onAfterRenderObservable.add(() => {
                    if (this.hotSpotName) {
                        if (viewerElement.queryHotSpot(this.hotSpotName, hotSpotResult)) {
                            const [screenX, screenY] = hotSpotResult.screenPosition;
                            const [worldX, worldY, worldZ] = hotSpotResult.worldPosition;
                            const { x: cameraX, y: cameraY, z: cameraZ } = camera.position;
                            console.log(`Screen:`, screenX, screenY, `World:`, worldX, worldY, worldZ);
                            // TODO: Raycast to the position and see if the expected triangle is hit. If not, don't show the hotspot.
                            depthTexture
                                .readPixels(undefined, undefined, readPixelsBuffer, undefined, undefined, Math.round(screenX), Math.round(screenY), 1, 1)
                                ?.then((result) => {
                                    const distance = new Vector3(cameraX, cameraY, cameraZ).subtract(new Vector3(worldX, worldY, worldZ)).length();
                                    console.log(`Distance:`, distance);
                                    const depth = readPixelsBuffer[0];
                                    console.log("Depth", depth);
                                    console.log("Delta", depth - distance);
                                });
                            this.style.transform = `translate(${screenX}px, ${screenY}px)`;
                            this._isValid = true;
                        } else {
                            this._isValid = false;
                        }
                    }
                });
            }
        };

        registerSceneRender();
        viewerElement.addEventListener("viewerready", registerSceneRender);

        this._viewerAttachment = {
            dispose() {
                viewerElement.removeEventListener("viewerready", registerSceneRender);
                depthRendererRegistration?.dispose();
                sceneRenderObserver?.remove();
                sceneRenderObserver = null;
            },
        };
    }

    // eslint-disable-next-line babylonjs/available
    override disconnectedCallback(): void {
        super.disconnectedCallback();

        this._viewerAttachment?.dispose();
        this._viewerAttachment = null;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected override render() {
        return html` <slot ?hidden="${!this._isValid}"></slot> `;
    }
}
