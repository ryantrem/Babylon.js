import { Nullable, float } from "../types";
import { FactorGradient, ColorGradient, Color3Gradient, IValueGradient, GradientHelper } from "../Misc/gradients";
import { Observable } from "../Misc/observable";
import { Vector3, Matrix, TmpVectors } from "../Maths/math.vector";
import { Color4, Color3, TmpColors } from '../Maths/math.color';
import { Scalar } from "../Maths/math.scalar";
import { VertexBuffer } from "../Meshes/buffer";
import { Buffer } from "../Meshes/buffer";
import { AbstractMesh } from "../Meshes/abstractMesh";
import { IParticleSystem } from "./IParticleSystem";
import { BaseParticleSystem } from "./baseParticleSystem";
import { ParticleSystem } from "./particleSystem";
import { Engine } from "../Engines/engine";
import { BoxParticleEmitter } from "../Particles/EmitterTypes/boxParticleEmitter";
import { Scene, IDisposable } from "../scene";
import { Effect, IEffectCreationOptions } from "../Materials/effect";
import { Material } from "../Materials/material";
import { MaterialHelper } from "../Materials/materialHelper";
import { ImageProcessingConfiguration } from "../Materials/imageProcessingConfiguration";
import { Texture } from "../Materials/Textures/texture";
import { RawTexture } from "../Materials/Textures/rawTexture";
import { Constants } from "../Engines/constants";
import { EngineStore } from "../Engines/engineStore";
import { DeepCopier } from "../Misc/deepCopier";
import { IAnimatable } from '../Animations/animatable.interface';
import { CustomParticleEmitter } from './EmitterTypes/customParticleEmitter';

import "../Shaders/gpuUpdateParticles.fragment";
import "../Shaders/gpuUpdateParticles.vertex";
import "../Shaders/gpuRenderParticles.fragment";
import "../Shaders/gpuRenderParticles.vertex";

/**
 * This represents a GPU particle system in Babylon
 * This is the fastest particle system in Babylon as it uses the GPU to update the individual particle data
 * @see https://www.babylonjs-playground.com/#PU4WYI#4
 */
export class GPUParticleSystem extends BaseParticleSystem implements IDisposable, IParticleSystem, IAnimatable {
    /**
     * The layer mask we are rendering the particles through.
     */
    public layerMask: number = 0x0FFFFFFF;

    private _capacity: number;
    private _activeCount: number;
    private _currentActiveCount: number;
    private _accumulatedCount = 0;
    private _renderEffect: Effect;
    private _updateEffect: Effect;

    private _buffer0: Buffer;
    private _buffer1: Buffer;
    private _spriteBuffer: Buffer;
    private _updateVAO: Array<WebGLVertexArrayObject>;
    private _renderVAO: Array<WebGLVertexArrayObject>;

    private _targetIndex = 0;
    private _sourceBuffer: Buffer;
    private _targetBuffer: Buffer;

    private _engine: Engine;

    private _currentRenderId = -1;
    private _started = false;
    private _stopped = false;

    private _timeDelta = 0;

    private _randomTexture: RawTexture;
    private _randomTexture2: RawTexture;

    private _attributesStrideSize: number;
    private _updateEffectOptions: IEffectCreationOptions;

    private _randomTextureSize: number;
    private _actualFrame = 0;

    private readonly _rawTextureWidth = 256;

    /**
     * Gets a boolean indicating if the GPU particles can be rendered on current browser
     */
    public static get IsSupported(): boolean {
        if (!EngineStore.LastCreatedEngine) {
            return false;
        }
        return EngineStore.LastCreatedEngine.webGLVersion > 1;
    }

    /**
    * An event triggered when the system is disposed.
    */
    public onDisposeObservable = new Observable<GPUParticleSystem>();

    /**
     * Gets the maximum number of particles active at the same time.
     * @returns The max number of active particles.
     */
    public getCapacity(): number {
        return this._capacity;
    }

    /**
     * Forces the particle to write their depth information to the depth buffer. This can help preventing other draw calls
     * to override the particles.
     */
    public forceDepthWrite = false;

    /**
     * Gets or set the number of active particles
     */
    public get activeParticleCount(): number {
        return this._activeCount;
    }

    public set activeParticleCount(value: number) {
        this._activeCount = Math.min(value, this._capacity);
    }

    private _preWarmDone = false;

    /**
     * Specifies if the particles are updated in emitter local space or world space.
     * This is always false for GPU particles
     */
    public get isLocal() {
        return false;
    }

    public set isLocal(value: boolean) {
        // Ignore
    }

    /**
     * Is this system ready to be used/rendered
     * @return true if the system is ready
     */
    public isReady(): boolean {
        if (!this._updateEffect) {
            this._recreateUpdateEffect();
            this._recreateRenderEffect();
            return false;
        }

        if (!this.emitter || !this._updateEffect.isReady() || !this._imageProcessingConfiguration.isReady() || !this._renderEffect.isReady() || !this.particleTexture || !this.particleTexture.isReady()) {
            return false;
        }

        return true;
    }

    /**
     * Gets if the system has been started. (Note: this will still be true after stop is called)
     * @returns True if it has been started, otherwise false.
     */
    public isStarted(): boolean {
        return this._started;
    }

    /**
     * Gets if the system has been stopped. (Note: rendering is still happening but the system is frozen)
     * @returns True if it has been stopped, otherwise false.
     */
    public isStopped(): boolean {
        return this._stopped;
    }

    /**
     * Gets a boolean indicating that the system is stopping
     * @returns true if the system is currently stopping
     */
    public isStopping() {
        return false; // Stop is immediate on GPU
    }

    /**
     * Gets the number of particles active at the same time.
     * @returns The number of active particles.
     */
    public getActiveCount() {
        return this._currentActiveCount;
    }

    /**
     * Starts the particle system and begins to emit
     * @param delay defines the delay in milliseconds before starting the system (this.startDelay by default)
     */
    public start(delay = this.startDelay): void {
        if (!this.targetStopDuration && this._hasTargetStopDurationDependantGradient()) {
            throw "Particle system started with a targetStopDuration dependant gradient (eg. startSizeGradients) but no targetStopDuration set";
        }
        if (delay) {
            setTimeout(() => {
                this.start(0);
            }, delay);
            return;
        }
        this._started = true;
        this._stopped = false;
        this._preWarmDone = false;

        // Animations
        if (this.beginAnimationOnStart && this.animations && this.animations.length > 0) {
            this.getScene().beginAnimation(this, this.beginAnimationFrom, this.beginAnimationTo, this.beginAnimationLoop);
        }
    }

    /**
     * Stops the particle system.
     */
    public stop(): void {
        this._stopped = true;
    }

    /**
     * Remove all active particles
     */
    public reset(): void {
        this._releaseBuffers();
        this._releaseVAOs();
        this._currentActiveCount = 0;
        this._targetIndex = 0;
    }

    /**
     * Returns the string "GPUParticleSystem"
     * @returns a string containing the class name
     */
    public getClassName(): string {
        return "GPUParticleSystem";
    }

    private _colorGradientsTexture: RawTexture;

    protected _removeGradientAndTexture(gradient: number, gradients: Nullable<IValueGradient[]>, texture: RawTexture): BaseParticleSystem {
        super._removeGradientAndTexture(gradient, gradients, texture);
        this._releaseBuffers();

        return this;
    }

    /**
     * Adds a new color gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param color1 defines the color to affect to the specified gradient
     * @param color2 defines an additional color used to define a range ([color, color2]) with main color to pick the final color from
     * @returns the current particle system
     */
    public addColorGradient(gradient: number, color1: Color4, color2?: Color4): GPUParticleSystem {
        if (!this._colorGradients) {
            this._colorGradients = [];
        }

        let colorGradient = new ColorGradient(gradient, color1);
        this._colorGradients.push(colorGradient);

        this._refreshColorGradient(true);

        this._releaseBuffers();

        return this;
    }

    private _refreshColorGradient(reorder = false) {
        if (this._colorGradients) {
            if (reorder) {
                this._colorGradients.sort((a, b) => {
                    if (a.gradient < b.gradient) {
                        return -1;
                    } else if (a.gradient > b.gradient) {
                        return 1;
                    }

                    return 0;
                });
            }

            if (this._colorGradientsTexture) {
                this._colorGradientsTexture.dispose();
                (<any>this._colorGradientsTexture) = null;
            }
        }
    }

    /** Force the system to rebuild all gradients that need to be resync */
    public forceRefreshGradients() {
        this._refreshColorGradient();
        this._refreshFactorGradient(this._sizeGradients, "_sizeGradientsTexture");
        this._refreshFactorGradient(this._angularSpeedGradients, "_angularSpeedGradientsTexture");
        this._refreshFactorGradient(this._velocityGradients, "_velocityGradientsTexture");
        this._refreshFactorGradient(this._limitVelocityGradients, "_limitVelocityGradientsTexture");
        this._refreshFactorGradient(this._dragGradients, "_dragGradientsTexture");

        this.reset();
    }

    /**
     * Remove a specific color gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeColorGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._colorGradients, this._colorGradientsTexture);
        (<any>this._colorGradientsTexture) = null;

        return this;
    }

    private _angularSpeedGradientsTexture: RawTexture;
    private _sizeGradientsTexture: RawTexture;
    private _velocityGradientsTexture: RawTexture;
    private _limitVelocityGradientsTexture: RawTexture;
    private _dragGradientsTexture: RawTexture;

    private _addFactorGradient(factorGradients: FactorGradient[], gradient: number, factor: number) {
        let valueGradient = new FactorGradient(gradient, factor);
        factorGradients.push(valueGradient);

        this._releaseBuffers();
    }

    /**
     * Adds a new size gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the size factor to affect to the specified gradient
     * @returns the current particle system
     */
    public addSizeGradient(gradient: number, factor: number): GPUParticleSystem {
        if (!this._sizeGradients) {
            this._sizeGradients = [];
        }

        this._addFactorGradient(this._sizeGradients, gradient, factor);

        this._refreshFactorGradient(this._sizeGradients, "_sizeGradientsTexture", true);

        this._releaseBuffers();

        return this;
    }

    /**
     * Remove a specific size gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeSizeGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._sizeGradients, this._sizeGradientsTexture);
        (<any>this._sizeGradientsTexture) = null;

        return this;
    }

    private _refreshFactorGradient(factorGradients: Nullable<FactorGradient[]>, textureName: string, reorder = false) {
        if (!factorGradients) {
            return;
        }

        if (reorder) {
            factorGradients.sort((a, b) => {
                if (a.gradient < b.gradient) {
                    return -1;
                } else if (a.gradient > b.gradient) {
                    return 1;
                }

                return 0;
            });
        }

        let that = this as any;
        if (that[textureName]) {
            that[textureName].dispose();
            that[textureName] = null;
        }
    }

    /**
     * Adds a new angular speed gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the angular speed to affect to the specified gradient
     * @returns the current particle system
     */
    public addAngularSpeedGradient(gradient: number, factor: number): GPUParticleSystem {
        if (!this._angularSpeedGradients) {
            this._angularSpeedGradients = [];
        }

        this._addFactorGradient(this._angularSpeedGradients, gradient, factor);
        this._refreshFactorGradient(this._angularSpeedGradients, "_angularSpeedGradientsTexture", true);

        this._releaseBuffers();

        return this;
    }

    /**
     * Remove a specific angular speed gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeAngularSpeedGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._angularSpeedGradients, this._angularSpeedGradientsTexture);
        (<any>this._angularSpeedGradientsTexture) = null;

        return this;
    }

    /**
     * Adds a new velocity gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the velocity to affect to the specified gradient
     * @returns the current particle system
     */
    public addVelocityGradient(gradient: number, factor: number): GPUParticleSystem {
        if (!this._velocityGradients) {
            this._velocityGradients = [];
        }

        this._addFactorGradient(this._velocityGradients, gradient, factor);
        this._refreshFactorGradient(this._velocityGradients, "_velocityGradientsTexture", true);

        this._releaseBuffers();

        return this;
    }

    /**
     * Remove a specific velocity gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeVelocityGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._velocityGradients, this._velocityGradientsTexture);
        (<any>this._velocityGradientsTexture) = null;

        return this;
    }

    /**
     * Adds a new limit velocity gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the limit velocity value to affect to the specified gradient
     * @returns the current particle system
     */
    public addLimitVelocityGradient(gradient: number, factor: number): GPUParticleSystem {
        if (!this._limitVelocityGradients) {
            this._limitVelocityGradients = [];
        }

        this._addFactorGradient(this._limitVelocityGradients, gradient, factor);
        this._refreshFactorGradient(this._limitVelocityGradients, "_limitVelocityGradientsTexture", true);

        this._releaseBuffers();

        return this;
    }

    /**
     * Remove a specific limit velocity gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeLimitVelocityGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._limitVelocityGradients, this._limitVelocityGradientsTexture);
        (<any>this._limitVelocityGradientsTexture) = null;

        return this;
    }

    /**
     * Adds a new drag gradient
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the drag value to affect to the specified gradient
     * @returns the current particle system
     */
    public addDragGradient(gradient: number, factor: number): GPUParticleSystem {
        if (!this._dragGradients) {
            this._dragGradients = [];
        }

        this._addFactorGradient(this._dragGradients, gradient, factor);
        this._refreshFactorGradient(this._dragGradients, "_dragGradientsTexture", true);

        this._releaseBuffers();

        return this;
    }

    /**
     * Remove a specific drag gradient
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeDragGradient(gradient: number): GPUParticleSystem {
        this._removeGradientAndTexture(gradient, this._dragGradients, this._dragGradientsTexture);
        (<any>this._dragGradientsTexture) = null;

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the emit rate value to affect to the specified gradient
     * @param factor2 defines an additional factor used to define a range ([factor, factor2]) with main value to pick the final value from
     * @returns the current particle system
     */
    public addEmitRateGradient(gradient: number, factor: number, factor2?: number): IParticleSystem {
        // Do nothing as emit rate is not supported by GPUParticleSystem
        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeEmitRateGradient(gradient: number): IParticleSystem {
        // Do nothing as emit rate is not supported by GPUParticleSystem
        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the start size value to affect to the specified gradient
     * @param factor2 defines an additional factor used to define a range ([factor, factor2]) with main value to pick the final value from
     * @returns the current particle system
     */
    public addStartSizeGradient(gradient: number, factor: number, factor2?: number): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem
        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeStartSizeGradient(gradient: number): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem
        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param min defines the color remap minimal range
     * @param max defines the color remap maximal range
     * @returns the current particle system
     */
    public addColorRemapGradient(gradient: number, min: number, max: number): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeColorRemapGradient(): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param min defines the alpha remap minimal range
     * @param max defines the alpha remap maximal range
     * @returns the current particle system
     */
    public addAlphaRemapGradient(gradient: number, min: number, max: number): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeAlphaRemapGradient(): IParticleSystem {
        // Do nothing as start size is not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param color defines the color to affect to the specified gradient
     * @returns the current particle system
     */
    public addRampGradient(gradient: number, color: Color3): IParticleSystem {
        //Not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeRampGradient(): IParticleSystem {
        //Not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @returns the list of ramp gradients
     */
    public getRampGradients(): Nullable<Array<Color3Gradient>> {
        return null;
    }

    /**
     * Not supported by GPUParticleSystem
     * Gets or sets a boolean indicating that ramp gradients must be used
     * @see http://doc.babylonjs.com/babylon101/particles#ramp-gradients
     */
    public get useRampGradients(): boolean {
        //Not supported by GPUParticleSystem
        return false;
    }

    public set useRampGradients(value: boolean) {
        //Not supported by GPUParticleSystem
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to use (between 0 and 1)
     * @param factor defines the life time factor to affect to the specified gradient
     * @param factor2 defines an additional factor used to define a range ([factor, factor2]) with main value to pick the final value from
     * @returns the current particle system
     */
    public addLifeTimeGradient(gradient: number, factor: number, factor2?: number): IParticleSystem {
        //Not supported by GPUParticleSystem

        return this;
    }

    /**
     * Not supported by GPUParticleSystem
     * @param gradient defines the gradient to remove
     * @returns the current particle system
     */
    public removeLifeTimeGradient(gradient: number): IParticleSystem {
        //Not supported by GPUParticleSystem

        return this;
    }

    /**
     * Instantiates a GPU particle system.
     * Particles are often small sprites used to simulate hard-to-reproduce phenomena like fire, smoke, water, or abstract visual effects like magic glitter and faery dust.
     * @param name The name of the particle system
     * @param options The options used to create the system
     * @param scene The scene the particle system belongs to
     * @param isAnimationSheetEnabled Must be true if using a spritesheet to animate the particles texture
     */
    constructor(name: string, options: Partial<{
        capacity: number,
        randomTextureSize: number
    }>, scene: Scene, isAnimationSheetEnabled: boolean = false) {
        super(name);
        this._scene = scene || EngineStore.LastCreatedScene;

        this.uniqueId = this._scene.getUniqueId();

        // Setup the default processing configuration to the scene.
        this._attachImageProcessingConfiguration(null);

        this._engine = this._scene.getEngine();

        if (!options.randomTextureSize) {
            delete options.randomTextureSize;
        }

        let fullOptions = {
            capacity: 50000,
            randomTextureSize: this._engine.getCaps().maxTextureSize,
            ...options
        };

        var optionsAsNumber = <number>options;
        if (isFinite(optionsAsNumber)) {
            fullOptions.capacity = optionsAsNumber;
        }

        this._capacity = fullOptions.capacity;
        this._activeCount = fullOptions.capacity;
        this._currentActiveCount = 0;
        this._isAnimationSheetEnabled = isAnimationSheetEnabled;

        this._scene.particleSystems.push(this);

        this._updateEffectOptions = {
            attributes: ["position", "initialPosition", "age", "life", "seed", "size", "color", "direction", "initialDirection", "angle", "cellIndex", "cellStartOffset", "noiseCoordinates1", "noiseCoordinates2"],
            uniformsNames: ["currentCount", "timeDelta", "emitterWM", "lifeTime", "color1", "color2", "sizeRange", "scaleRange", "gravity", "emitPower",
                "direction1", "direction2", "minEmitBox", "maxEmitBox", "radius", "directionRandomizer", "height", "coneAngle", "stopFactor",
                "angleRange", "radiusRange", "cellInfos", "noiseStrength", "limitVelocityDamping"],
            uniformBuffersNames: [],
            samplers: ["randomSampler", "randomSampler2", "sizeGradientSampler", "angularSpeedGradientSampler", "velocityGradientSampler", "limitVelocityGradientSampler", "noiseSampler", "dragGradientSampler"],
            defines: "",
            fallbacks: null,
            onCompiled: null,
            onError: null,
            indexParameters: null,
            maxSimultaneousLights: 0,
            transformFeedbackVaryings: []
        };

        this.particleEmitterType = new BoxParticleEmitter();

        // Random data
        var maxTextureSize = Math.min(this._engine.getCaps().maxTextureSize, fullOptions.randomTextureSize);
        var d = [];
        for (var i = 0; i < maxTextureSize; ++i) {
            d.push(Math.random());
            d.push(Math.random());
            d.push(Math.random());
            d.push(Math.random());
        }
        this._randomTexture = new RawTexture(new Float32Array(d), maxTextureSize, 1, Constants.TEXTUREFORMAT_RGBA, this._scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
        this._randomTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        this._randomTexture.wrapV = Texture.WRAP_ADDRESSMODE;

        d = [];
        for (var i = 0; i < maxTextureSize; ++i) {
            d.push(Math.random());
            d.push(Math.random());
            d.push(Math.random());
            d.push(Math.random());
        }
        this._randomTexture2 = new RawTexture(new Float32Array(d), maxTextureSize, 1, Constants.TEXTUREFORMAT_RGBA, this._scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
        this._randomTexture2.wrapU = Texture.WRAP_ADDRESSMODE;
        this._randomTexture2.wrapV = Texture.WRAP_ADDRESSMODE;

        this._randomTextureSize = maxTextureSize;
    }

    protected _reset() {
        this._releaseBuffers();
    }

    private _createUpdateVAO(source: Buffer): WebGLVertexArrayObject {
        let updateVertexBuffers: { [key: string]: VertexBuffer } = {};
        updateVertexBuffers["position"] = source.createVertexBuffer("position", 0, 3);

        let offset = 3;
        if (this.particleEmitterType instanceof CustomParticleEmitter) {
            updateVertexBuffers["initialPosition"] = source.createVertexBuffer("initialPosition", offset, 3);
            offset += 3;
        }
        updateVertexBuffers["age"] = source.createVertexBuffer("age", offset, 1);
        offset += 1;
        updateVertexBuffers["life"] = source.createVertexBuffer("life", offset, 1);
        offset += 1;
        updateVertexBuffers["seed"] = source.createVertexBuffer("seed", offset, 4);
        offset += 4;
        updateVertexBuffers["size"] = source.createVertexBuffer("size", offset, 3);
        offset += 3;

        if (!this._colorGradientsTexture) {
            updateVertexBuffers["color"] = source.createVertexBuffer("color", offset, 4);
            offset += 4;
        }

        updateVertexBuffers["direction"] = source.createVertexBuffer("direction", offset, 3);
        offset += 3;

        if (!this._isBillboardBased) {
            updateVertexBuffers["initialDirection"] = source.createVertexBuffer("initialDirection", offset, 3);
            offset += 3;
        }

        if (this._angularSpeedGradientsTexture) {
            updateVertexBuffers["angle"] = source.createVertexBuffer("angle", offset, 1);
            offset += 1;
        } else {
            updateVertexBuffers["angle"] = source.createVertexBuffer("angle", offset, 2);
            offset += 2;
        }

        if (this._isAnimationSheetEnabled) {
            updateVertexBuffers["cellIndex"] = source.createVertexBuffer("cellIndex", offset, 1);
            offset += 1;
            if (this.spriteRandomStartCell) {
                updateVertexBuffers["cellStartOffset"] = source.createVertexBuffer("cellStartOffset", offset, 1);
                offset += 1;
            }
        }

        if (this.noiseTexture) {
            updateVertexBuffers["noiseCoordinates1"] = source.createVertexBuffer("noiseCoordinates1", offset, 3);
            offset += 3;
            updateVertexBuffers["noiseCoordinates2"] = source.createVertexBuffer("noiseCoordinates2", offset, 3);
            offset += 3;
        }

        let vao = this._engine.recordVertexArrayObject(updateVertexBuffers, null, this._updateEffect);
        this._engine.bindArrayBuffer(null);

        return vao;
    }

    private _createRenderVAO(source: Buffer, spriteSource: Buffer): WebGLVertexArrayObject {
        let renderVertexBuffers: { [key: string]: VertexBuffer } = {};
        renderVertexBuffers["position"] = source.createVertexBuffer("position", 0, 3, this._attributesStrideSize, true);
        let offset = 3;
        if (this.particleEmitterType instanceof CustomParticleEmitter) {
            offset += 3;
        }
        renderVertexBuffers["age"] = source.createVertexBuffer("age", offset, 1, this._attributesStrideSize, true);
        offset += 1;
        renderVertexBuffers["life"] = source.createVertexBuffer("life", offset, 1, this._attributesStrideSize, true);
        offset += 5;
        renderVertexBuffers["size"] = source.createVertexBuffer("size", offset, 3, this._attributesStrideSize, true);
        offset += 3;

        if (!this._colorGradientsTexture) {
            renderVertexBuffers["color"] = source.createVertexBuffer("color", offset, 4, this._attributesStrideSize, true);
            offset += 4;
        }

        if (this.billboardMode === ParticleSystem.BILLBOARDMODE_STRETCHED) {
            renderVertexBuffers["direction"] = source.createVertexBuffer("direction", offset, 3, this._attributesStrideSize, true);
        }
        offset += 3; // Direction

        if (!this._isBillboardBased) {
            renderVertexBuffers["initialDirection"] = source.createVertexBuffer("initialDirection", offset, 3, this._attributesStrideSize, true);
            offset += 3;
        }

        renderVertexBuffers["angle"] = source.createVertexBuffer("angle", offset, 1, this._attributesStrideSize, true);
        if (this._angularSpeedGradientsTexture) {
            offset++;
        } else {
            offset += 2;
        }

        if (this._isAnimationSheetEnabled) {
            renderVertexBuffers["cellIndex"] = source.createVertexBuffer("cellIndex", offset, 1, this._attributesStrideSize, true);
            offset += 1;
            if (this.spriteRandomStartCell) {
                renderVertexBuffers["cellStartOffset"] = source.createVertexBuffer("cellStartOffset", offset, 1, this._attributesStrideSize, true);
                offset += 1;
            }
        }

        if (this.noiseTexture) {
            renderVertexBuffers["noiseCoordinates1"] = source.createVertexBuffer("noiseCoordinates1", offset, 3, this._attributesStrideSize, true);
            offset += 3;
            renderVertexBuffers["noiseCoordinates2"] = source.createVertexBuffer("noiseCoordinates2", offset, 3, this._attributesStrideSize, true);
            offset += 3;
        }

        renderVertexBuffers["offset"] = spriteSource.createVertexBuffer("offset", 0, 2);
        renderVertexBuffers["uv"] = spriteSource.createVertexBuffer("uv", 2, 2);

        let vao = this._engine.recordVertexArrayObject(renderVertexBuffers, null, this._renderEffect);
        this._engine.bindArrayBuffer(null);

        return vao;
    }

    private _initialize(force = false): void {
        if (this._buffer0 && !force) {
            return;
        }

        let engine = this._scene.getEngine();
        var data = new Array<float>();

        this._attributesStrideSize = 21;
        this._targetIndex = 0;

        if (this.particleEmitterType instanceof CustomParticleEmitter) {
            this._attributesStrideSize += 3;
        }

        if (!this.isBillboardBased) {
            this._attributesStrideSize += 3;
        }

        if (this._colorGradientsTexture) {
            this._attributesStrideSize -= 4;
        }

        if (this._angularSpeedGradientsTexture) {
            this._attributesStrideSize -= 1;
        }

        if (this._isAnimationSheetEnabled) {
            this._attributesStrideSize += 1;
            if (this.spriteRandomStartCell) {
                this._attributesStrideSize += 1;
            }
        }

        if (this.noiseTexture) {
            this._attributesStrideSize += 6;
        }

        const usingCustomEmitter = this.particleEmitterType instanceof CustomParticleEmitter;
        const tmpVector = TmpVectors.Vector3[0];

        for (var particleIndex = 0; particleIndex < this._capacity; particleIndex++) {
            // position
            data.push(0.0);
            data.push(0.0);
            data.push(0.0);

            if (usingCustomEmitter) {
                (this.particleEmitterType as CustomParticleEmitter).particlePositionGenerator(particleIndex, null, tmpVector);
                data.push(tmpVector.x);
                data.push(tmpVector.y);
                data.push(tmpVector.z);
            }

            // Age and life
            data.push(0.0); // create the particle as a dead one to create a new one at start
            data.push(0.0);

            // Seed
            data.push(Math.random());
            data.push(Math.random());
            data.push(Math.random());
            data.push(Math.random());

            // Size
            data.push(0.0);
            data.push(0.0);
            data.push(0.0);

            if (!this._colorGradientsTexture) {
                // color
                data.push(0.0);
                data.push(0.0);
                data.push(0.0);
                data.push(0.0);
            }

            // direction
            if (usingCustomEmitter) {
                (this.particleEmitterType as CustomParticleEmitter).particleDestinationGenerator(particleIndex, null, tmpVector);
                data.push(tmpVector.x);
                data.push(tmpVector.y);
                data.push(tmpVector.z);
            } else {
                data.push(0.0);
                data.push(0.0);
                data.push(0.0);
            }

            if (!this.isBillboardBased) {
                // initialDirection
                data.push(0.0);
                data.push(0.0);
                data.push(0.0);
            }

            // angle
            data.push(0.0);

            if (!this._angularSpeedGradientsTexture) {
                data.push(0.0);
            }

            if (this._isAnimationSheetEnabled) {
                data.push(0.0);
                if (this.spriteRandomStartCell) {
                    data.push(0.0);
                }
            }

            if (this.noiseTexture) { // Random coordinates for reading into noise texture
                data.push(Math.random());
                data.push(Math.random());
                data.push(Math.random());
                data.push(Math.random());
                data.push(Math.random());
                data.push(Math.random());
            }
        }

        // Sprite data
        var spriteData = new Float32Array([0.5, 0.5, 1, 1,
            -0.5, 0.5, 0, 1,
            -0.5, -0.5, 0, 0,
            0.5, -0.5, 1, 0]);

        // Buffers
        this._buffer0 = new Buffer(engine, data, false, this._attributesStrideSize);
        this._buffer1 = new Buffer(engine, data, false, this._attributesStrideSize);
        this._spriteBuffer = new Buffer(engine, spriteData, false, 4);

        // Update VAO
        this._updateVAO = [];
        this._updateVAO.push(this._createUpdateVAO(this._buffer0));
        this._updateVAO.push(this._createUpdateVAO(this._buffer1));

        // Render VAO
        this._renderVAO = [];
        this._renderVAO.push(this._createRenderVAO(this._buffer1, this._spriteBuffer));
        this._renderVAO.push(this._createRenderVAO(this._buffer0, this._spriteBuffer));

        // Links
        this._sourceBuffer = this._buffer0;
        this._targetBuffer = this._buffer1;

    }

    /** @hidden */
    public _recreateUpdateEffect() {
        let defines = this.particleEmitterType ? this.particleEmitterType.getEffectDefines() : "";

        if (this._isBillboardBased) {
            defines += "\n#define BILLBOARD";
        }

        if (this._colorGradientsTexture) {
            defines += "\n#define COLORGRADIENTS";
        }

        if (this._sizeGradientsTexture) {
            defines += "\n#define SIZEGRADIENTS";
        }

        if (this._angularSpeedGradientsTexture) {
            defines += "\n#define ANGULARSPEEDGRADIENTS";
        }

        if (this._velocityGradientsTexture) {
            defines += "\n#define VELOCITYGRADIENTS";
        }

        if (this._limitVelocityGradientsTexture) {
            defines += "\n#define LIMITVELOCITYGRADIENTS";
        }

        if (this._dragGradientsTexture) {
            defines += "\n#define DRAGGRADIENTS";
        }

        if (this.isAnimationSheetEnabled) {
            defines += "\n#define ANIMATESHEET";
            if (this.spriteRandomStartCell) {
                defines += "\n#define ANIMATESHEETRANDOMSTART";
            }
        }

        if (this.noiseTexture) {
            defines += "\n#define NOISE";
        }

        if (this._updateEffect && this._updateEffectOptions.defines === defines) {
            return;
        }

        this._updateEffectOptions.transformFeedbackVaryings = ["outPosition"];

        if (this.particleEmitterType instanceof CustomParticleEmitter) {
            this._updateEffectOptions.transformFeedbackVaryings.push("outInitialPosition");
        }

        this._updateEffectOptions.transformFeedbackVaryings.push("outAge");
        this._updateEffectOptions.transformFeedbackVaryings.push("outLife");
        this._updateEffectOptions.transformFeedbackVaryings.push("outSeed");
        this._updateEffectOptions.transformFeedbackVaryings.push("outSize");

        if (!this._colorGradientsTexture) {
            this._updateEffectOptions.transformFeedbackVaryings.push("outColor");
        }

        this._updateEffectOptions.transformFeedbackVaryings.push("outDirection");

        if (!this._isBillboardBased) {
            this._updateEffectOptions.transformFeedbackVaryings.push("outInitialDirection");
        }

        this._updateEffectOptions.transformFeedbackVaryings.push("outAngle");

        if (this.isAnimationSheetEnabled) {
            this._updateEffectOptions.transformFeedbackVaryings.push("outCellIndex");
            if (this.spriteRandomStartCell) {
                this._updateEffectOptions.transformFeedbackVaryings.push("outCellStartOffset");
            }
        }

        if (this.noiseTexture) {
            this._updateEffectOptions.transformFeedbackVaryings.push("outNoiseCoordinates1");
            this._updateEffectOptions.transformFeedbackVaryings.push("outNoiseCoordinates2");
        }

        this._updateEffectOptions.defines = defines;
        this._updateEffect = new Effect("gpuUpdateParticles", this._updateEffectOptions, this._scene.getEngine());
    }

    /** @hidden */
    public _recreateRenderEffect() {
        let defines = "";
        if (this._scene.clipPlane) {
            defines = "\n#define CLIPPLANE";
        }
        if (this._scene.clipPlane2) {
            defines = "\n#define CLIPPLANE2";
        }
        if (this._scene.clipPlane3) {
            defines = "\n#define CLIPPLANE3";
        }
        if (this._scene.clipPlane4) {
            defines = "\n#define CLIPPLANE4";
        }
        if (this._scene.clipPlane5) {
            defines = "\n#define CLIPPLANE5";
        }
        if (this._scene.clipPlane6) {
            defines = "\n#define CLIPPLANE6";
        }

        if (this.blendMode === ParticleSystem.BLENDMODE_MULTIPLY) {
            defines = "\n#define BLENDMULTIPLYMODE";
        }

        if (this._isBillboardBased) {
            defines += "\n#define BILLBOARD";

            switch (this.billboardMode) {
                case ParticleSystem.BILLBOARDMODE_Y:
                    defines += "\n#define BILLBOARDY";
                    break;
                case ParticleSystem.BILLBOARDMODE_STRETCHED:
                    defines += "\n#define BILLBOARDSTRETCHED";
                    break;
                case ParticleSystem.BILLBOARDMODE_ALL:
                default:
                    break;
            }
        }

        if (this._colorGradientsTexture) {
            defines += "\n#define COLORGRADIENTS";
        }

        if (this.isAnimationSheetEnabled) {
            defines += "\n#define ANIMATESHEET";
        }

        if (this._imageProcessingConfiguration) {
            this._imageProcessingConfiguration.prepareDefines(this._imageProcessingConfigurationDefines);
            defines += "\n" + this._imageProcessingConfigurationDefines.toString();
        }

        if (this._renderEffect && this._renderEffect.defines === defines) {
            return;
        }

        var uniforms = ["worldOffset", "view", "projection", "colorDead", "invView", "vClipPlane", "vClipPlane2", "vClipPlane3", "vClipPlane4", "vClipPlane5", "vClipPlane6", "sheetInfos", "translationPivot", "eyePosition"];
        var samplers = ["textureSampler", "colorGradientSampler"];

        if (ImageProcessingConfiguration) {
            ImageProcessingConfiguration.PrepareUniforms(uniforms, this._imageProcessingConfigurationDefines);
            ImageProcessingConfiguration.PrepareSamplers(samplers, this._imageProcessingConfigurationDefines);
        }

        this._renderEffect = new Effect("gpuRenderParticles",
            ["position", "age", "life", "size", "color", "offset", "uv", "direction", "initialDirection", "angle", "cellIndex"],
            uniforms,
            samplers, this._scene.getEngine(), defines);
    }

    /**
     * Animates the particle system for the current frame by emitting new particles and or animating the living ones.
     * @param preWarm defines if we are in the pre-warmimg phase
     */
    public animate(preWarm = false): void {
        this._timeDelta = this.updateSpeed * (preWarm ? this.preWarmStepOffset : this._scene.getAnimationRatio());
        this._actualFrame += this._timeDelta;

        if (!this._stopped) {
            if (this.targetStopDuration && this._actualFrame >= this.targetStopDuration) {
                this.stop();
            }
        }
    }

    private _createFactorGradientTexture(factorGradients: Nullable<IValueGradient[]>, textureName: string) {
        let texture: RawTexture = (<any>this)[textureName];

        if (!factorGradients || !factorGradients.length || texture) {
            return;
        }

        let data = new Float32Array(this._rawTextureWidth);

        for (var x = 0; x < this._rawTextureWidth; x++) {
            var ratio = x / this._rawTextureWidth;

            GradientHelper.GetCurrentGradient(ratio, factorGradients, (currentGradient, nextGradient, scale) => {
                data[x] = Scalar.Lerp((<FactorGradient>currentGradient).factor1, (<FactorGradient>nextGradient).factor1, scale);
            });
        }

        (<any>this)[textureName] = RawTexture.CreateRTexture(data, this._rawTextureWidth, 1, this._scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    }

    private _createSizeGradientTexture() {
        this._createFactorGradientTexture(this._sizeGradients, "_sizeGradientsTexture");
    }

    private _createAngularSpeedGradientTexture() {
        this._createFactorGradientTexture(this._angularSpeedGradients, "_angularSpeedGradientsTexture");
    }

    private _createVelocityGradientTexture() {
        this._createFactorGradientTexture(this._velocityGradients, "_velocityGradientsTexture");
    }

    private _createLimitVelocityGradientTexture() {
        this._createFactorGradientTexture(this._limitVelocityGradients, "_limitVelocityGradientsTexture");
    }

    private _createDragGradientTexture() {
        this._createFactorGradientTexture(this._dragGradients, "_dragGradientsTexture");
    }

    private _createColorGradientTexture() {
        if (!this._colorGradients || !this._colorGradients.length || this._colorGradientsTexture) {
            return;
        }

        let data = new Uint8Array(this._rawTextureWidth * 4);
        let tmpColor = TmpColors.Color4[0];

        for (var x = 0; x < this._rawTextureWidth; x++) {
            var ratio = x / this._rawTextureWidth;

            GradientHelper.GetCurrentGradient(ratio, this._colorGradients, (currentGradient, nextGradient, scale) => {

                Color4.LerpToRef((<ColorGradient>currentGradient).color1, (<ColorGradient>nextGradient).color1, scale, tmpColor);
                data[x * 4] = tmpColor.r * 255;
                data[x * 4 + 1] = tmpColor.g * 255;
                data[x * 4 + 2] = tmpColor.b * 255;
                data[x * 4 + 3] = tmpColor.a * 255;
            });

        }

        this._colorGradientsTexture = RawTexture.CreateRGBATexture(data, this._rawTextureWidth, 1, this._scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    }

    /**
     * Renders the particle system in its current state
     * @param preWarm defines if the system should only update the particles but not render them
     * @returns the current number of particles
     */
    public render(preWarm = false): number {
        if (!this._started) {
            return 0;
        }

        this._createColorGradientTexture();
        this._createSizeGradientTexture();
        this._createAngularSpeedGradientTexture();
        this._createVelocityGradientTexture();
        this._createLimitVelocityGradientTexture();
        this._createDragGradientTexture();

        this._recreateUpdateEffect();
        this._recreateRenderEffect();

        if (!this.isReady()) {
            return 0;
        }

        if (!preWarm) {
            if (!this._preWarmDone && this.preWarmCycles) {
                for (var index = 0; index < this.preWarmCycles; index++) {
                    this.animate(true);
                    this.render(true);
                }

                this._preWarmDone = true;
            }

            if (this._currentRenderId === this._scene.getFrameId()) {
                return 0;
            }

            this._currentRenderId = this._scene.getFrameId();
        }

        // Get everything ready to render
        this._initialize();

        this._accumulatedCount += this.emitRate * this._timeDelta;
        if (this._accumulatedCount > 1) {
            var intPart = this._accumulatedCount | 0;
            this._accumulatedCount -= intPart;
            this._currentActiveCount = Math.min(this._activeCount, this._currentActiveCount + intPart);
        }

        if (!this._currentActiveCount) {
            return 0;
        }

        // Enable update effect
        this._engine.enableEffect(this._updateEffect);
        this._engine.setState(false);

        this._updateEffect.setFloat("currentCount", this._currentActiveCount);
        this._updateEffect.setFloat("timeDelta", this._timeDelta);
        this._updateEffect.setFloat("stopFactor", this._stopped ? 0 : 1);
        this._updateEffect.setTexture("randomSampler", this._randomTexture);
        this._updateEffect.setTexture("randomSampler2", this._randomTexture2);
        this._updateEffect.setFloat2("lifeTime", this.minLifeTime, this.maxLifeTime);
        this._updateEffect.setFloat2("emitPower", this.minEmitPower, this.maxEmitPower);
        if (!this._colorGradientsTexture) {
            this._updateEffect.setDirectColor4("color1", this.color1);
            this._updateEffect.setDirectColor4("color2", this.color2);
        }
        this._updateEffect.setFloat2("sizeRange", this.minSize, this.maxSize);
        this._updateEffect.setFloat4("scaleRange", this.minScaleX, this.maxScaleX, this.minScaleY, this.maxScaleY);
        this._updateEffect.setFloat4("angleRange", this.minAngularSpeed, this.maxAngularSpeed, this.minInitialRotation, this.maxInitialRotation);
        this._updateEffect.setVector3("gravity", this.gravity);

        if (this._sizeGradientsTexture) {
            this._updateEffect.setTexture("sizeGradientSampler", this._sizeGradientsTexture);
        }

        if (this._angularSpeedGradientsTexture) {
            this._updateEffect.setTexture("angularSpeedGradientSampler", this._angularSpeedGradientsTexture);
        }

        if (this._velocityGradientsTexture) {
            this._updateEffect.setTexture("velocityGradientSampler", this._velocityGradientsTexture);
        }

        if (this._limitVelocityGradientsTexture) {
            this._updateEffect.setTexture("limitVelocityGradientSampler", this._limitVelocityGradientsTexture);
            this._updateEffect.setFloat("limitVelocityDamping", this.limitVelocityDamping);
        }

        if (this._dragGradientsTexture) {
            this._updateEffect.setTexture("dragGradientSampler", this._dragGradientsTexture);
        }

        if (this.particleEmitterType) {
            this.particleEmitterType.applyToShader(this._updateEffect);
        }
        if (this._isAnimationSheetEnabled) {
            this._updateEffect.setFloat3("cellInfos", this.startSpriteCellID, this.endSpriteCellID, this.spriteCellChangeSpeed);
        }

        if (this.noiseTexture) {
            this._updateEffect.setTexture("noiseSampler", this.noiseTexture);
            this._updateEffect.setVector3("noiseStrength", this.noiseStrength);
        }

        let emitterWM: Matrix;
        if ((<AbstractMesh>this.emitter).position) {
            var emitterMesh = (<AbstractMesh>this.emitter);
            emitterWM = emitterMesh.getWorldMatrix();
        } else {
            var emitterPosition = (<Vector3>this.emitter);
            emitterWM = Matrix.Translation(emitterPosition.x, emitterPosition.y, emitterPosition.z);
        }
        this._updateEffect.setMatrix("emitterWM", emitterWM);

        // Bind source VAO
        this._engine.bindVertexArrayObject(this._updateVAO[this._targetIndex], null);

        // Update
        this._engine.bindTransformFeedbackBuffer(this._targetBuffer.getBuffer());
        this._engine.setRasterizerState(false);
        this._engine.beginTransformFeedback(true);
        this._engine.drawArraysType(Material.PointListDrawMode, 0, this._currentActiveCount);
        this._engine.endTransformFeedback();
        this._engine.setRasterizerState(true);
        this._engine.bindTransformFeedbackBuffer(null);

        if (!preWarm) {
            // Enable render effect
            this._engine.enableEffect(this._renderEffect);
            let viewMatrix = this._scene.getViewMatrix();
            this._renderEffect.setMatrix("view", viewMatrix);
            this._renderEffect.setMatrix("projection", this._scene.getProjectionMatrix());
            this._renderEffect.setTexture("textureSampler", this.particleTexture);
            this._renderEffect.setVector2("translationPivot", this.translationPivot);
            this._renderEffect.setVector3("worldOffset", this.worldOffset);
            if (this._colorGradientsTexture) {
                this._renderEffect.setTexture("colorGradientSampler", this._colorGradientsTexture);
            } else {
                this._renderEffect.setDirectColor4("colorDead", this.colorDead);
            }

            if (this._isAnimationSheetEnabled && this.particleTexture) {
                let baseSize = this.particleTexture.getBaseSize();
                this._renderEffect.setFloat3("sheetInfos", this.spriteCellWidth / baseSize.width, this.spriteCellHeight / baseSize.height, baseSize.width / this.spriteCellWidth);
            }

            if (this._isBillboardBased) {
                var camera = this._scene.activeCamera!;
                this._renderEffect.setVector3("eyePosition", camera.globalPosition);
            }

            if (this._scene.clipPlane || this._scene.clipPlane2 || this._scene.clipPlane3 || this._scene.clipPlane4 || this._scene.clipPlane5 || this._scene.clipPlane6) {
                var invView = viewMatrix.clone();
                invView.invert();
                this._renderEffect.setMatrix("invView", invView);
                MaterialHelper.BindClipPlane(this._renderEffect, this._scene);
            }

            // image processing
            if (this._imageProcessingConfiguration && !this._imageProcessingConfiguration.applyByPostProcess) {
                this._imageProcessingConfiguration.bind(this._renderEffect);
            }

            // Draw order
            switch (this.blendMode) {
                case ParticleSystem.BLENDMODE_ADD:
                    this._engine.setAlphaMode(Constants.ALPHA_ADD);
                    break;
                case ParticleSystem.BLENDMODE_ONEONE:
                    this._engine.setAlphaMode(Constants.ALPHA_ONEONE);
                    break;
                case ParticleSystem.BLENDMODE_STANDARD:
                    this._engine.setAlphaMode(Constants.ALPHA_COMBINE);
                    break;
                case ParticleSystem.BLENDMODE_MULTIPLY:
                    this._engine.setAlphaMode(Constants.ALPHA_MULTIPLY);
                    break;
            }

            if (this.forceDepthWrite) {
                this._engine.setDepthWrite(true);
            }

            // Bind source VAO
            this._engine.bindVertexArrayObject(this._renderVAO[this._targetIndex], null);

            // Render
            this._engine.drawArraysType(Material.TriangleFanDrawMode, 0, 4, this._currentActiveCount);
            this._engine.setAlphaMode(Constants.ALPHA_DISABLE);
        }
        // Switch VAOs
        this._targetIndex++;
        if (this._targetIndex === 2) {
            this._targetIndex = 0;
        }

        // Switch buffers
        let tmpBuffer = this._sourceBuffer;
        this._sourceBuffer = this._targetBuffer;
        this._targetBuffer = tmpBuffer;

        return this._currentActiveCount;
    }

    /**
     * Rebuilds the particle system
     */
    public rebuild(): void {
        this._initialize(true);
    }

    private _releaseBuffers() {
        if (this._buffer0) {
            this._buffer0.dispose();
            (<any>this._buffer0) = null;
        }
        if (this._buffer1) {
            this._buffer1.dispose();
            (<any>this._buffer1) = null;
        }
        if (this._spriteBuffer) {
            this._spriteBuffer.dispose();
            (<any>this._spriteBuffer) = null;
        }
    }

    private _releaseVAOs() {
        if (!this._updateVAO) {
            return;
        }

        for (var index = 0; index < this._updateVAO.length; index++) {
            this._engine.releaseVertexArrayObject(this._updateVAO[index]);
        }
        this._updateVAO = [];

        for (var index = 0; index < this._renderVAO.length; index++) {
            this._engine.releaseVertexArrayObject(this._renderVAO[index]);
        }
        this._renderVAO = [];
    }

    /**
     * Disposes the particle system and free the associated resources
     * @param disposeTexture defines if the particule texture must be disposed as well (true by default)
     */
    public dispose(disposeTexture = true): void {
        var index = this._scene.particleSystems.indexOf(this);
        if (index > -1) {
            this._scene.particleSystems.splice(index, 1);
        }

        this._releaseBuffers();
        this._releaseVAOs();

        if (this._colorGradientsTexture) {
            this._colorGradientsTexture.dispose();
            (<any>this._colorGradientsTexture) = null;
        }

        if (this._sizeGradientsTexture) {
            this._sizeGradientsTexture.dispose();
            (<any>this._sizeGradientsTexture) = null;
        }

        if (this._angularSpeedGradientsTexture) {
            this._angularSpeedGradientsTexture.dispose();
            (<any>this._angularSpeedGradientsTexture) = null;
        }

        if (this._velocityGradientsTexture) {
            this._velocityGradientsTexture.dispose();
            (<any>this._velocityGradientsTexture) = null;
        }

        if (this._limitVelocityGradientsTexture) {
            this._limitVelocityGradientsTexture.dispose();
            (<any>this._limitVelocityGradientsTexture) = null;
        }

        if (this._dragGradientsTexture) {
            this._dragGradientsTexture.dispose();
            (<any>this._dragGradientsTexture) = null;
        }

        if (this._randomTexture) {
            this._randomTexture.dispose();
            (<any>this._randomTexture) = null;
        }

        if (this._randomTexture2) {
            this._randomTexture2.dispose();
            (<any>this._randomTexture2) = null;
        }

        if (disposeTexture && this.particleTexture) {
            this.particleTexture.dispose();
            this.particleTexture = null;
        }

        if (disposeTexture && this.noiseTexture) {
            this.noiseTexture.dispose();
            this.noiseTexture = null;
        }

        // Callback
        this.onDisposeObservable.notifyObservers(this);
        this.onDisposeObservable.clear();
    }
    /**
     * Clones the particle system.
     * @param name The name of the cloned object
     * @param newEmitter The new emitter to use
     * @returns the cloned particle system
     */
    public clone(name: string, newEmitter: any): GPUParticleSystem {
        var result = new GPUParticleSystem(name, { capacity: this._capacity, randomTextureSize: this._randomTextureSize }, this._scene);

        DeepCopier.DeepCopy(this, result, ["particles", "customShader", "noiseTexture", "particleTexture", "onDisposeObservable"]);

        if (newEmitter === undefined) {
            newEmitter = this.emitter;
        }

        result.emitter = newEmitter;
        if (this.particleTexture) {
            result.particleTexture = new Texture(this.particleTexture.url, this._scene);
        }

        result.noiseTexture = this.noiseTexture;

        // Clone gradients
        if (this._colorGradients) {
            this._colorGradients.forEach((v) => {
                result.addColorGradient(v.gradient, v.color1, v.color2);
            });
        }
        if (this._dragGradients) {
            this._dragGradients.forEach((v) => {
                result.addDragGradient(v.gradient, v.factor1);
            });
        }
        if (this._angularSpeedGradients) {
            this._angularSpeedGradients.forEach((v) => {
                result.addAngularSpeedGradient(v.gradient, v.factor1);
            });
        }
        if (this._emitRateGradients) {
            this._emitRateGradients.forEach((v) => {
                result.addEmitRateGradient(v.gradient, v.factor1, v.factor2);
            });
        }
        if (this._lifeTimeGradients) {
            this._lifeTimeGradients.forEach((v) => {
                result.addLifeTimeGradient(v.gradient, v.factor1, v.factor2);
            });
        }
        if (this._limitVelocityGradients) {
            this._limitVelocityGradients.forEach((v) => {
                result.addLimitVelocityGradient(v.gradient, v.factor1);
            });
        }
        if (this._sizeGradients) {
            this._sizeGradients.forEach((v) => {
                result.addSizeGradient(v.gradient, v.factor1);
            });
        }
        if (this._startSizeGradients) {
            this._startSizeGradients.forEach((v) => {
                result.addStartSizeGradient(v.gradient, v.factor1, v.factor2);
            });
        }
        if (this._velocityGradients) {
            this._velocityGradients.forEach((v) => {
                result.addVelocityGradient(v.gradient, v.factor1);
            });
        }
        if (this._rampGradients) {
            this._rampGradients.forEach((v) => {
                result.addRampGradient(v.gradient, v.color);
            });
        }
        if (this._colorRemapGradients) {
            this._colorRemapGradients.forEach((v) => {
                result.addColorRemapGradient(v.gradient, v.factor1, v.factor2!);
            });
        }
        if (this._alphaRemapGradients) {
            this._alphaRemapGradients.forEach((v) => {
                result.addAlphaRemapGradient(v.gradient, v.factor1, v.factor2!);
            });
        }

        return result;
    }

    /**
     * Serializes the particle system to a JSON object
     * @param serializeTexture defines if the texture must be serialized as well
     * @returns the JSON object
     */
    public serialize(serializeTexture = false): any {
        var serializationObject: any = {};

        ParticleSystem._Serialize(serializationObject, this, serializeTexture);
        serializationObject.activeParticleCount = this.activeParticleCount;

        return serializationObject;
    }

    /**
     * Parses a JSON object to create a GPU particle system.
     * @param parsedParticleSystem The JSON object to parse
     * @param scene The scene to create the particle system in
     * @param rootUrl The root url to use to load external dependencies like texture
     * @param doNotStart Ignore the preventAutoStart attribute and does not start
     * @returns the parsed GPU particle system
     */
    public static Parse(parsedParticleSystem: any, scene: Scene, rootUrl: string, doNotStart = false): GPUParticleSystem {
        var name = parsedParticleSystem.name;
        var particleSystem = new GPUParticleSystem(name, { capacity: parsedParticleSystem.capacity, randomTextureSize: parsedParticleSystem.randomTextureSize }, scene);

        if (parsedParticleSystem.activeParticleCount) {
            particleSystem.activeParticleCount = parsedParticleSystem.activeParticleCount;
        }
        ParticleSystem._Parse(parsedParticleSystem, particleSystem, scene, rootUrl);

        // Auto start
        if (parsedParticleSystem.preventAutoStart) {
            particleSystem.preventAutoStart = parsedParticleSystem.preventAutoStart;
        }

        if (!doNotStart && !particleSystem.preventAutoStart) {
            particleSystem.start();
        }

        return particleSystem;
    }
}
