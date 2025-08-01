import { Observable } from "core/Misc/observable";
import type { Scene } from "core/scene";
import type { Nullable } from "core/types";
import { RuntimeAnimation } from "./runtimeAnimation";
import { Animation } from "./animation";
import { PrecisionDate } from "core/Misc/precisionDate";
import { Matrix, Quaternion, TmpVectors, Vector3 } from "core/Maths/math.vector";
import type { Bone } from "core/Bones/bone";
import type { Node } from "../node";

/**
 * Class used to store an actual running animation
 */
export class Animatable {
    /**
     * If true, the animatable will be processed even if it is considered actively paused (weight of 0 and previous weight of 0).
     * This can be used to force the full processing of paused animatables in the animation engine.
     * Default is false.
     */
    public static ProcessPausedAnimatables = false;

    private _localDelayOffset: Nullable<number> = null;
    private _pausedDelay: Nullable<number> = null;
    private _manualJumpDelay: Nullable<number> = null;
    /** @hidden */
    public _runtimeAnimations = new Array<RuntimeAnimation>();
    private _paused = false;
    private _scene: Scene;
    private _speedRatio = 1;
    private _weight = -1.0;
    private _previousWeight = -1.0;
    private _syncRoot: Nullable<Animatable> = null;
    private _frameToSyncFromJump: Nullable<number> = null;
    private _goToFrame: Nullable<number> = null;

    /**
     * Gets or sets a boolean indicating if the animatable must be disposed and removed at the end of the animation.
     * This will only apply for non looping animation (default is true)
     */
    public disposeOnEnd = true;

    /**
     * Gets a boolean indicating if the animation has started
     */
    public animationStarted = false;

    /**
     * Observer raised when the animation ends
     */
    public onAnimationEndObservable = new Observable<Animatable>();

    /**
     * Observer raised when the animation loops
     */
    public onAnimationLoopObservable = new Observable<Animatable>();

    /**
     * Gets the root Animatable used to synchronize and normalize animations
     */
    public get syncRoot(): Nullable<Animatable> {
        return this._syncRoot;
    }

    /**
     * Gets the current frame of the first RuntimeAnimation
     * Used to synchronize Animatables
     */
    public get masterFrame(): number {
        if (this._runtimeAnimations.length === 0) {
            return 0;
        }

        return this._runtimeAnimations[0].currentFrame;
    }

    /**
     * Gets or sets the animatable weight (-1.0 by default meaning not weighted)
     */
    public get weight(): number {
        return this._weight;
    }

    public set weight(value: number) {
        if (value === -1) {
            // -1 is ok and means no weight
            this._weight = -1;
            return;
        }

        // Else weight must be in [0, 1] range
        this._weight = Math.min(Math.max(value, 0), 1.0);
    }

    /**
     * Gets or sets the speed ratio to apply to the animatable (1.0 by default)
     */
    public get speedRatio(): number {
        return this._speedRatio;
    }

    public set speedRatio(value: number) {
        for (let index = 0; index < this._runtimeAnimations.length; index++) {
            const animation = this._runtimeAnimations[index];

            animation._prepareForSpeedRatioChange(value);
        }
        this._speedRatio = value;

        // Resync _manualJumpDelay in case goToFrame was called before speedRatio was set.
        if (this._goToFrame !== null) {
            this.goToFrame(this._goToFrame);
        }
    }

    /**
     * Gets the elapsed time since the animatable started in milliseconds
     */
    public get elapsedTime(): number {
        return this._localDelayOffset === null ? 0 : this._scene._animationTime - this._localDelayOffset;
    }

    /**
     * Creates a new Animatable
     * @param scene defines the hosting scene
     * @param target defines the target object
     * @param fromFrame defines the starting frame number (default is 0)
     * @param toFrame defines the ending frame number (default is 100)
     * @param loopAnimation defines if the animation must loop (default is false)
     * @param speedRatio defines the factor to apply to animation speed (default is 1)
     * @param onAnimationEnd defines a callback to call when animation ends if it is not looping
     * @param animations defines a group of animation to add to the new Animatable
     * @param onAnimationLoop defines a callback to call when animation loops
     * @param isAdditive defines whether the animation should be evaluated additively
     * @param playOrder defines the order in which this animatable should be processed in the list of active animatables (default: 0)
     */
    constructor(
        scene: Scene,
        /** defines the target object */
        public target: any,
        /** [0] defines the starting frame number (default is 0) */
        public fromFrame: number = 0,
        /** [100] defines the ending frame number (default is 100) */
        public toFrame: number = 100,
        /** [false] defines if the animation must loop (default is false)  */
        public loopAnimation: boolean = false,
        speedRatio: number = 1.0,
        /** defines a callback to call when animation ends if it is not looping */
        public onAnimationEnd?: Nullable<() => void>,
        animations?: Animation[],
        /** defines a callback to call when animation loops */
        public onAnimationLoop?: Nullable<() => void>,
        /** [false] defines whether the animation should be evaluated additively */
        public isAdditive: boolean = false,
        /** [0] defines the order in which this animatable should be processed in the list of active animatables (default: 0) */
        public playOrder = 0
    ) {
        this._scene = scene;
        if (animations) {
            this.appendAnimations(target, animations);
        }

        this._speedRatio = speedRatio;
        scene._activeAnimatables.push(this);
    }

    // Methods
    /**
     * Synchronize and normalize current Animatable with a source Animatable
     * This is useful when using animation weights and when animations are not of the same length
     * @param root defines the root Animatable to synchronize with (null to stop synchronizing)
     * @returns the current Animatable
     */
    public syncWith(root: Nullable<Animatable>): Animatable {
        this._syncRoot = root;

        if (root) {
            // Make sure this animatable will animate after the root
            const index = this._scene._activeAnimatables.indexOf(this);
            if (index > -1) {
                this._scene._activeAnimatables.splice(index, 1);
                this._scene._activeAnimatables.push(this);
            }
        }

        return this;
    }

    /**
     * Gets the list of runtime animations
     * @returns an array of RuntimeAnimation
     */
    public getAnimations(): RuntimeAnimation[] {
        return this._runtimeAnimations;
    }

    /**
     * Adds more animations to the current animatable
     * @param target defines the target of the animations
     * @param animations defines the new animations to add
     */
    public appendAnimations(target: any, animations: Animation[]): void {
        for (let index = 0; index < animations.length; index++) {
            const animation = animations[index];

            const newRuntimeAnimation = new RuntimeAnimation(target, animation, this._scene, this);
            newRuntimeAnimation._onLoop = () => {
                this.onAnimationLoopObservable.notifyObservers(this);
                if (this.onAnimationLoop) {
                    this.onAnimationLoop();
                }
            };

            this._runtimeAnimations.push(newRuntimeAnimation);
        }
    }

    /**
     * Gets the source animation for a specific property
     * @param property defines the property to look for
     * @returns null or the source animation for the given property
     */
    public getAnimationByTargetProperty(property: string): Nullable<Animation> {
        const runtimeAnimations = this._runtimeAnimations;

        for (let index = 0; index < runtimeAnimations.length; index++) {
            if (runtimeAnimations[index].animation.targetProperty === property) {
                return runtimeAnimations[index].animation;
            }
        }

        return null;
    }

    /**
     * Gets the runtime animation for a specific property
     * @param property defines the property to look for
     * @returns null or the runtime animation for the given property
     */
    public getRuntimeAnimationByTargetProperty(property: string): Nullable<RuntimeAnimation> {
        const runtimeAnimations = this._runtimeAnimations;

        for (let index = 0; index < runtimeAnimations.length; index++) {
            if (runtimeAnimations[index].animation.targetProperty === property) {
                return runtimeAnimations[index];
            }
        }

        return null;
    }

    /**
     * Resets the animatable to its original state
     */
    public reset(): void {
        const runtimeAnimations = this._runtimeAnimations;

        for (let index = 0; index < runtimeAnimations.length; index++) {
            runtimeAnimations[index].reset(true);
        }

        this._localDelayOffset = null;
        this._pausedDelay = null;
    }

    /**
     * Allows the animatable to blend with current running animations
     * @see https://doc.babylonjs.com/features/featuresDeepDive/animation/advanced_animations#animation-blending
     * @param blendingSpeed defines the blending speed to use
     */
    public enableBlending(blendingSpeed: number): void {
        const runtimeAnimations = this._runtimeAnimations;

        for (let index = 0; index < runtimeAnimations.length; index++) {
            runtimeAnimations[index].animation.enableBlending = true;
            runtimeAnimations[index].animation.blendingSpeed = blendingSpeed;
        }
    }

    /**
     * Disable animation blending
     * @see https://doc.babylonjs.com/features/featuresDeepDive/animation/advanced_animations#animation-blending
     */
    public disableBlending(): void {
        const runtimeAnimations = this._runtimeAnimations;

        for (let index = 0; index < runtimeAnimations.length; index++) {
            runtimeAnimations[index].animation.enableBlending = false;
        }
    }

    /**
     * Jump directly to a given frame
     * @param frame defines the frame to jump to
     * @param useWeight defines whether the animation weight should be applied to the image to be jumped to (false by default)
     */
    public goToFrame(frame: number, useWeight = false): void {
        const runtimeAnimations = this._runtimeAnimations;

        if (runtimeAnimations[0]) {
            const fps = runtimeAnimations[0].animation.framePerSecond;
            this._frameToSyncFromJump = this._frameToSyncFromJump ?? runtimeAnimations[0].currentFrame;
            const delay = this.speedRatio === 0 ? 0 : (((frame - this._frameToSyncFromJump) / fps) * 1000) / this.speedRatio;
            this._manualJumpDelay = -delay;
        }

        for (let index = 0; index < runtimeAnimations.length; index++) {
            runtimeAnimations[index].goToFrame(frame, useWeight ? this._weight : -1);
        }

        this._goToFrame = frame;
    }

    /**
     * Returns true if the animations for this animatable are paused
     */
    public get paused() {
        return this._paused;
    }

    /**
     * Pause the animation
     */
    public pause(): void {
        if (this._paused) {
            return;
        }
        this._paused = true;
    }

    /**
     * Restart the animation
     */
    public restart(): void {
        this._paused = false;
    }

    private _raiseOnAnimationEnd() {
        if (this.onAnimationEnd) {
            this.onAnimationEnd();
        }

        this.onAnimationEndObservable.notifyObservers(this);
    }

    /**
     * Stop and delete the current animation
     * @param animationName defines a string used to only stop some of the runtime animations instead of all
     * @param targetMask a function that determines if the animation should be stopped based on its target (all animations will be stopped if both this and animationName are empty)
     * @param useGlobalSplice if true, the animatables will be removed by the caller of this function (false by default)
     * @param skipOnAnimationEnd defines if the system should not raise onAnimationEnd. Default is false
     */
    public stop(animationName?: string, targetMask?: (target: any) => boolean, useGlobalSplice = false, skipOnAnimationEnd = false): void {
        if (animationName || targetMask) {
            const idx = this._scene._activeAnimatables.indexOf(this);

            if (idx > -1) {
                const runtimeAnimations = this._runtimeAnimations;

                for (let index = runtimeAnimations.length - 1; index >= 0; index--) {
                    const runtimeAnimation = runtimeAnimations[index];
                    if (animationName && runtimeAnimation.animation.name != animationName) {
                        continue;
                    }
                    if (targetMask && !targetMask(runtimeAnimation.target)) {
                        continue;
                    }

                    runtimeAnimation.dispose();
                    runtimeAnimations.splice(index, 1);
                }

                if (runtimeAnimations.length == 0) {
                    if (!useGlobalSplice) {
                        this._scene._activeAnimatables.splice(idx, 1);
                    }
                    if (!skipOnAnimationEnd) {
                        this._raiseOnAnimationEnd();
                    }
                }
            }
        } else {
            const index = this._scene._activeAnimatables.indexOf(this);

            if (index > -1) {
                if (!useGlobalSplice) {
                    this._scene._activeAnimatables.splice(index, 1);
                }
                const runtimeAnimations = this._runtimeAnimations;

                for (let index = 0; index < runtimeAnimations.length; index++) {
                    runtimeAnimations[index].dispose();
                }

                this._runtimeAnimations.length = 0;

                if (!skipOnAnimationEnd) {
                    this._raiseOnAnimationEnd();
                }
            }
        }
    }

    /**
     * Wait asynchronously for the animation to end
     * @returns a promise which will be fulfilled when the animation ends
     */
    public async waitAsync(): Promise<Animatable> {
        return await new Promise((resolve) => {
            this.onAnimationEndObservable.add(
                () => {
                    resolve(this);
                },
                undefined,
                undefined,
                this,
                true
            );
        });
    }

    /**
     * @internal
     */
    public _animate(delay: number): boolean {
        if (this._paused) {
            this.animationStarted = false;
            if (this._pausedDelay === null) {
                this._pausedDelay = delay;
            }
            return true;
        }

        if (this._localDelayOffset === null) {
            this._localDelayOffset = delay;
            this._pausedDelay = null;
        } else if (this._pausedDelay !== null) {
            this._localDelayOffset += delay - this._pausedDelay;
            this._pausedDelay = null;
        }

        if (this._manualJumpDelay !== null) {
            this._localDelayOffset += this.speedRatio < 0 ? -this._manualJumpDelay : this._manualJumpDelay;
            this._manualJumpDelay = null;
            this._frameToSyncFromJump = null;
        }

        this._goToFrame = null;

        if (!Animatable.ProcessPausedAnimatables && this._weight === 0 && this._previousWeight === 0) {
            // We consider that an animatable with a weight === 0 is "actively" paused
            return true;
        }

        this._previousWeight = this._weight;

        // Animating
        let running = false;
        const runtimeAnimations = this._runtimeAnimations;
        let index: number;

        for (index = 0; index < runtimeAnimations.length; index++) {
            const animation = runtimeAnimations[index];
            const isRunning = animation.animate(delay - this._localDelayOffset, this.fromFrame, this.toFrame, this.loopAnimation, this._speedRatio, this._weight);
            running = running || isRunning;
        }

        this.animationStarted = running;

        if (!running) {
            if (this.disposeOnEnd) {
                // Remove from active animatables
                index = this._scene._activeAnimatables.indexOf(this);
                this._scene._activeAnimatables.splice(index, 1);

                // Dispose all runtime animations
                for (index = 0; index < runtimeAnimations.length; index++) {
                    runtimeAnimations[index].dispose();
                }
            }

            this._raiseOnAnimationEnd();

            if (this.disposeOnEnd) {
                this.onAnimationEnd = null;
                this.onAnimationLoop = null;
                this.onAnimationLoopObservable.clear();
                this.onAnimationEndObservable.clear();
            }
        }

        return running;
    }
}

/** @internal */
function ProcessLateAnimationBindingsForMatrices(holder: {
    totalWeight: number;
    totalAdditiveWeight: number;
    animations: RuntimeAnimation[];
    additiveAnimations: RuntimeAnimation[];
    originalValue: Matrix;
}): any {
    if (holder.totalWeight === 0 && holder.totalAdditiveWeight === 0) {
        return holder.originalValue;
    }

    let normalizer = 1.0;
    const finalPosition = TmpVectors.Vector3[0];
    const finalScaling = TmpVectors.Vector3[1];
    const finalQuaternion = TmpVectors.Quaternion[0];
    let startIndex = 0;
    const originalAnimation = holder.animations[0];
    const originalValue = holder.originalValue;

    let scale = 1;
    let skipOverride = false;
    if (holder.totalWeight < 1.0) {
        // We need to mix the original value in
        scale = 1.0 - holder.totalWeight;
        originalValue.decompose(finalScaling, finalQuaternion, finalPosition);
    } else {
        startIndex = 1;
        // We need to normalize the weights
        normalizer = holder.totalWeight;
        scale = originalAnimation.weight / normalizer;
        if (scale == 1) {
            if (holder.totalAdditiveWeight) {
                skipOverride = true;
            } else {
                return originalAnimation.currentValue;
            }
        }

        originalAnimation.currentValue.decompose(finalScaling, finalQuaternion, finalPosition);
    }

    // Add up the override animations
    if (!skipOverride) {
        finalScaling.scaleInPlace(scale);
        finalPosition.scaleInPlace(scale);
        finalQuaternion.scaleInPlace(scale);

        for (let animIndex = startIndex; animIndex < holder.animations.length; animIndex++) {
            const runtimeAnimation = holder.animations[animIndex];
            if (runtimeAnimation.weight === 0) {
                continue;
            }

            scale = runtimeAnimation.weight / normalizer;
            const currentPosition = TmpVectors.Vector3[2];
            const currentScaling = TmpVectors.Vector3[3];
            const currentQuaternion = TmpVectors.Quaternion[1];

            runtimeAnimation.currentValue.decompose(currentScaling, currentQuaternion, currentPosition);

            currentScaling.scaleAndAddToRef(scale, finalScaling);
            currentQuaternion.scaleAndAddToRef(Quaternion.Dot(finalQuaternion, currentQuaternion) > 0 ? scale : -scale, finalQuaternion);
            currentPosition.scaleAndAddToRef(scale, finalPosition);
        }

        finalQuaternion.normalize();
    }

    // Add up the additive animations
    for (let animIndex = 0; animIndex < holder.additiveAnimations.length; animIndex++) {
        const runtimeAnimation = holder.additiveAnimations[animIndex];
        if (runtimeAnimation.weight === 0) {
            continue;
        }

        const currentPosition = TmpVectors.Vector3[2];
        const currentScaling = TmpVectors.Vector3[3];
        const currentQuaternion = TmpVectors.Quaternion[1];

        runtimeAnimation.currentValue.decompose(currentScaling, currentQuaternion, currentPosition);
        currentScaling.multiplyToRef(finalScaling, currentScaling);
        Vector3.LerpToRef(finalScaling, currentScaling, runtimeAnimation.weight, finalScaling);
        finalQuaternion.multiplyToRef(currentQuaternion, currentQuaternion);
        Quaternion.SlerpToRef(finalQuaternion, currentQuaternion, runtimeAnimation.weight, finalQuaternion);
        currentPosition.scaleAndAddToRef(runtimeAnimation.weight, finalPosition);
    }

    const workValue = originalAnimation ? originalAnimation._animationState.workValue : TmpVectors.Matrix[0].clone();
    Matrix.ComposeToRef(finalScaling, finalQuaternion, finalPosition, workValue);
    return workValue;
}

/** @internal */
function ProcessLateAnimationBindingsForQuaternions(
    holder: {
        totalWeight: number;
        totalAdditiveWeight: number;
        animations: RuntimeAnimation[];
        additiveAnimations: RuntimeAnimation[];
        originalValue: Quaternion;
    },
    refQuaternion: Quaternion
): Quaternion {
    if (holder.totalWeight === 0 && holder.totalAdditiveWeight === 0) {
        return refQuaternion;
    }

    const originalAnimation = holder.animations[0];
    const originalValue = holder.originalValue;
    let cumulativeQuaternion = refQuaternion;

    if (holder.totalWeight === 0 && holder.totalAdditiveWeight > 0) {
        cumulativeQuaternion.copyFrom(originalValue);
    } else if (holder.animations.length === 1) {
        Quaternion.SlerpToRef(originalValue, originalAnimation.currentValue, Math.min(1.0, holder.totalWeight), cumulativeQuaternion);

        if (holder.totalAdditiveWeight === 0) {
            return cumulativeQuaternion;
        }
    } else if (holder.animations.length > 1) {
        // Add up the override animations
        let normalizer = 1.0;
        let quaternions: Array<Quaternion>;
        let weights: Array<number>;

        if (holder.totalWeight < 1.0) {
            const scale = 1.0 - holder.totalWeight;

            quaternions = [];
            weights = [];

            quaternions.push(originalValue);
            weights.push(scale);
        } else {
            if (holder.animations.length === 2) {
                // Slerp as soon as we can
                Quaternion.SlerpToRef(holder.animations[0].currentValue, holder.animations[1].currentValue, holder.animations[1].weight / holder.totalWeight, refQuaternion);

                if (holder.totalAdditiveWeight === 0) {
                    return refQuaternion;
                }
            }

            quaternions = [];
            weights = [];
            normalizer = holder.totalWeight;
        }

        for (let animIndex = 0; animIndex < holder.animations.length; animIndex++) {
            const runtimeAnimation = holder.animations[animIndex];
            quaternions.push(runtimeAnimation.currentValue);
            weights.push(runtimeAnimation.weight / normalizer);
        }

        // https://gamedev.stackexchange.com/questions/62354/method-for-interpolation-between-3-quaternions

        let cumulativeAmount = 0;
        for (let index = 0; index < quaternions.length; ) {
            if (!index) {
                Quaternion.SlerpToRef(quaternions[index], quaternions[index + 1], weights[index + 1] / (weights[index] + weights[index + 1]), refQuaternion);
                cumulativeQuaternion = refQuaternion;
                cumulativeAmount = weights[index] + weights[index + 1];
                index += 2;
                continue;
            }
            cumulativeAmount += weights[index];
            Quaternion.SlerpToRef(cumulativeQuaternion, quaternions[index], weights[index] / cumulativeAmount, cumulativeQuaternion);
            index++;
        }
    }

    // Add up the additive animations
    for (let animIndex = 0; animIndex < holder.additiveAnimations.length; animIndex++) {
        const runtimeAnimation = holder.additiveAnimations[animIndex];
        if (runtimeAnimation.weight === 0) {
            continue;
        }

        cumulativeQuaternion.multiplyToRef(runtimeAnimation.currentValue, TmpVectors.Quaternion[0]);
        Quaternion.SlerpToRef(cumulativeQuaternion, TmpVectors.Quaternion[0], runtimeAnimation.weight, cumulativeQuaternion);
    }

    return cumulativeQuaternion;
}

/** @internal */
function ProcessLateAnimationBindings(scene: Scene): void {
    if (!scene._registeredForLateAnimationBindings.length) {
        return;
    }
    for (let index = 0; index < scene._registeredForLateAnimationBindings.length; index++) {
        const target = scene._registeredForLateAnimationBindings.data[index];

        for (const path in target._lateAnimationHolders) {
            const holder = target._lateAnimationHolders[path];
            const originalAnimation: RuntimeAnimation = holder.animations[0];
            const originalValue = holder.originalValue;
            if (originalValue === undefined || originalValue === null) {
                continue;
            }
            const matrixDecomposeMode = Animation.AllowMatrixDecomposeForInterpolation && originalValue.m; // ie. data is matrix

            let finalValue: any = target[path];
            if (matrixDecomposeMode) {
                finalValue = ProcessLateAnimationBindingsForMatrices(holder);
            } else {
                const quaternionMode = originalValue.w !== undefined;
                if (quaternionMode) {
                    finalValue = ProcessLateAnimationBindingsForQuaternions(holder, finalValue || Quaternion.Identity());
                } else {
                    let startIndex = 0;
                    let normalizer = 1.0;

                    const originalAnimationIsLoopRelativeFromCurrent =
                        originalAnimation && originalAnimation._animationState.loopMode === Animation.ANIMATIONLOOPMODE_RELATIVE_FROM_CURRENT;

                    if (holder.totalWeight < 1.0) {
                        // We need to mix the original value in
                        if (originalAnimationIsLoopRelativeFromCurrent) {
                            finalValue = originalValue.clone ? originalValue.clone() : originalValue;
                        } else if (originalAnimation && originalValue.scale) {
                            finalValue = originalValue.scale(1.0 - holder.totalWeight);
                        } else if (originalAnimation) {
                            finalValue = originalValue * (1.0 - holder.totalWeight);
                        } else if (originalValue.clone) {
                            finalValue = originalValue.clone();
                        } else {
                            finalValue = originalValue;
                        }
                    } else if (originalAnimation) {
                        // We need to normalize the weights
                        normalizer = holder.totalWeight;
                        const scale = originalAnimation.weight / normalizer;
                        if (scale !== 1) {
                            if (originalAnimation.currentValue.scale) {
                                finalValue = originalAnimation.currentValue.scale(scale);
                            } else {
                                finalValue = originalAnimation.currentValue * scale;
                            }
                        } else {
                            finalValue = originalAnimation.currentValue;
                        }

                        if (originalAnimationIsLoopRelativeFromCurrent) {
                            if (finalValue.addToRef) {
                                finalValue.addToRef(originalValue, finalValue);
                            } else {
                                finalValue += originalValue;
                            }
                        }

                        startIndex = 1;
                    }

                    // Add up the override animations
                    for (let animIndex = startIndex; animIndex < holder.animations.length; animIndex++) {
                        const runtimeAnimation = holder.animations[animIndex];
                        const scale = runtimeAnimation.weight / normalizer;

                        if (!scale) {
                            continue;
                        } else if (runtimeAnimation.currentValue.scaleAndAddToRef) {
                            runtimeAnimation.currentValue.scaleAndAddToRef(scale, finalValue);
                        } else {
                            finalValue += runtimeAnimation.currentValue * scale;
                        }
                    }

                    // Add up the additive animations
                    for (let animIndex = 0; animIndex < holder.additiveAnimations.length; animIndex++) {
                        const runtimeAnimation = holder.additiveAnimations[animIndex];
                        const scale: number = runtimeAnimation.weight;

                        if (!scale) {
                            continue;
                        } else if (runtimeAnimation.currentValue.scaleAndAddToRef) {
                            runtimeAnimation.currentValue.scaleAndAddToRef(scale, finalValue);
                        } else {
                            finalValue += runtimeAnimation.currentValue * scale;
                        }
                    }
                }
            }
            target[path] = finalValue;
        }

        target._lateAnimationHolders = {};
    }
    scene._registeredForLateAnimationBindings.reset();
}

/** @internal */
export function RegisterTargetForLateAnimationBinding(scene: Scene, runtimeAnimation: RuntimeAnimation, originalValue: any): void {
    const target = runtimeAnimation.target;
    scene._registeredForLateAnimationBindings.pushNoDuplicate(target);

    if (!target._lateAnimationHolders) {
        target._lateAnimationHolders = {};
    }

    if (!target._lateAnimationHolders[runtimeAnimation.targetPath]) {
        target._lateAnimationHolders[runtimeAnimation.targetPath] = {
            totalWeight: 0,
            totalAdditiveWeight: 0,
            animations: [],
            additiveAnimations: [],
            originalValue: originalValue,
        };
    }

    if (runtimeAnimation.isAdditive) {
        target._lateAnimationHolders[runtimeAnimation.targetPath].additiveAnimations.push(runtimeAnimation);
        target._lateAnimationHolders[runtimeAnimation.targetPath].totalAdditiveWeight += runtimeAnimation.weight;
    } else {
        target._lateAnimationHolders[runtimeAnimation.targetPath].animations.push(runtimeAnimation);
        target._lateAnimationHolders[runtimeAnimation.targetPath].totalWeight += runtimeAnimation.weight;
    }
}

/**
 * Initialize all the inter dependecies between the animations and Scene and Bone
 * @param sceneClass defines the scene prototype to use
 * @param boneClass defines the bone prototype to use
 */
export function AddAnimationExtensions(sceneClass: typeof Scene, boneClass: typeof Bone): void {
    if (boneClass) {
        boneClass.prototype.copyAnimationRange = function (
            source: Bone,
            rangeName: string,
            frameOffset: number,
            rescaleAsRequired = false,
            skelDimensionsRatio: Nullable<Vector3> = null
        ): boolean {
            // all animation may be coming from a library skeleton, so may need to create animation
            if (this.animations.length === 0) {
                this.animations.push(new Animation(this.name, "_matrix", source.animations[0].framePerSecond, Animation.ANIMATIONTYPE_MATRIX, 0));
                this.animations[0].setKeys([]);
            }

            // get animation info / verify there is such a range from the source bone
            const sourceRange = source.animations[0].getRange(rangeName);
            if (!sourceRange) {
                return false;
            }
            const from = sourceRange.from;
            const to = sourceRange.to;
            const sourceKeys = source.animations[0].getKeys();

            // rescaling prep
            const sourceBoneLength = source.length;
            const sourceParent = source.getParent();
            const parent = this.getParent();
            const parentScalingReqd = rescaleAsRequired && sourceParent && sourceBoneLength && this.length && sourceBoneLength !== this.length;
            const parentRatio = parentScalingReqd && parent && sourceParent ? parent.length / sourceParent.length : 1;

            const dimensionsScalingReqd =
                rescaleAsRequired && !parent && skelDimensionsRatio && (skelDimensionsRatio.x !== 1 || skelDimensionsRatio.y !== 1 || skelDimensionsRatio.z !== 1);

            const destKeys = this.animations[0].getKeys();

            // loop vars declaration
            let orig: { frame: number; value: Matrix };
            let origTranslation: Vector3;
            let mat: Matrix;

            for (let key = 0, nKeys = sourceKeys.length; key < nKeys; key++) {
                orig = sourceKeys[key];
                if (orig.frame >= from && orig.frame <= to) {
                    if (rescaleAsRequired) {
                        mat = orig.value.clone();

                        // scale based on parent ratio, when bone has parent
                        if (parentScalingReqd) {
                            origTranslation = mat.getTranslation();
                            mat.setTranslation(origTranslation.scaleInPlace(parentRatio));

                            // scale based on skeleton dimension ratio when root bone, and value is passed
                        } else if (dimensionsScalingReqd && skelDimensionsRatio) {
                            origTranslation = mat.getTranslation();
                            mat.setTranslation(origTranslation.multiplyInPlace(skelDimensionsRatio));

                            // use original when root bone, and no data for skelDimensionsRatio
                        } else {
                            mat = orig.value;
                        }
                    } else {
                        mat = orig.value;
                    }
                    destKeys.push({ frame: orig.frame + frameOffset, value: mat });
                }
            }
            this.animations[0].createRange(rangeName, from + frameOffset, to + frameOffset);
            return true;
        };
    }

    if (!sceneClass) {
        return;
    }

    sceneClass.prototype._animate = function (customDeltaTime?: number): void {
        if (!this.animationsEnabled) {
            return;
        }

        // Getting time
        const now = PrecisionDate.Now;
        if (!this._animationTimeLast) {
            if (this._pendingData.length > 0) {
                return;
            }
            this._animationTimeLast = now;
        }

        this.deltaTime = customDeltaTime !== undefined ? customDeltaTime : this.useConstantAnimationDeltaTime ? 16.0 : (now - this._animationTimeLast) * this.animationTimeScale;
        this._animationTimeLast = now;

        const animatables = this._activeAnimatables;
        if (animatables.length === 0) {
            return;
        }

        this._animationTime += this.deltaTime;
        const animationTime = this._animationTime;

        for (let index = 0; index < animatables.length; index++) {
            const animatable = animatables[index];

            if (!animatable._animate(animationTime) && animatable.disposeOnEnd) {
                index--; // Array was updated
            }
        }

        // Late animation bindings
        ProcessLateAnimationBindings(this);
    };

    sceneClass.prototype.sortActiveAnimatables = function (): void {
        this._activeAnimatables.sort((a, b) => {
            return a.playOrder - b.playOrder;
        });
    };

    sceneClass.prototype.beginWeightedAnimation = function (
        target: any,
        from: number,
        to: number,
        weight = 1.0,
        loop?: boolean,
        speedRatio: number = 1.0,
        onAnimationEnd?: () => void,
        animatable?: Animatable,
        targetMask?: (target: any) => boolean,
        onAnimationLoop?: () => void,
        isAdditive = false
    ): Animatable {
        const returnedAnimatable = this.beginAnimation(target, from, to, loop, speedRatio, onAnimationEnd, animatable, false, targetMask, onAnimationLoop, isAdditive);
        returnedAnimatable.weight = weight;

        return returnedAnimatable;
    };

    sceneClass.prototype.beginAnimation = function (
        target: any,
        from: number,
        to: number,
        loop?: boolean,
        speedRatio: number = 1.0,
        onAnimationEnd?: () => void,
        animatable?: Animatable,
        stopCurrent = true,
        targetMask?: (target: any) => boolean,
        onAnimationLoop?: () => void,
        isAdditive = false
    ): Animatable {
        // get speed speedRatio, to and from, based on the sign and value(s)
        if (speedRatio < 0) {
            const tmp = from;
            from = to;
            to = tmp;
            speedRatio = -speedRatio;
        }
        // if from > to switch speed ratio
        if (from > to) {
            speedRatio = -speedRatio;
        }
        if (stopCurrent) {
            this.stopAnimation(target, undefined, targetMask);
        }

        if (!animatable) {
            animatable = new Animatable(this, target, from, to, loop, speedRatio, onAnimationEnd, undefined, onAnimationLoop, isAdditive);
        }

        const shouldRunTargetAnimations = targetMask ? targetMask(target) : true;
        // Local animations
        if (target.animations && shouldRunTargetAnimations) {
            animatable.appendAnimations(target, target.animations);
        }

        // Children animations
        if (target.getAnimatables) {
            const animatables = target.getAnimatables();
            for (let index = 0; index < animatables.length; index++) {
                this.beginAnimation(animatables[index], from, to, loop, speedRatio, onAnimationEnd, animatable, stopCurrent, targetMask, onAnimationLoop);
            }
        }

        animatable.reset();

        return animatable;
    };

    sceneClass.prototype.beginHierarchyAnimation = function (
        target: any,
        directDescendantsOnly: boolean,
        from: number,
        to: number,
        loop?: boolean,
        speedRatio: number = 1.0,
        onAnimationEnd?: () => void,
        animatable?: Animatable,
        stopCurrent = true,
        targetMask?: (target: any) => boolean,
        onAnimationLoop?: () => void,
        isAdditive = false
    ): Animatable[] {
        const children = target.getDescendants(directDescendantsOnly);

        const result = [];
        result.push(this.beginAnimation(target, from, to, loop, speedRatio, onAnimationEnd, animatable, stopCurrent, targetMask, undefined, isAdditive));
        for (const child of children) {
            result.push(this.beginAnimation(child, from, to, loop, speedRatio, onAnimationEnd, animatable, stopCurrent, targetMask, undefined, isAdditive));
        }

        return result;
    };

    sceneClass.prototype.beginDirectAnimation = function (
        target: any,
        animations: Animation[],
        from: number,
        to: number,
        loop?: boolean,
        speedRatio: number = 1.0,
        onAnimationEnd?: () => void,
        onAnimationLoop?: () => void,
        isAdditive = false
    ): Animatable {
        // get speed speedRatio, to and from, based on the sign and value(s)
        if (speedRatio < 0) {
            const tmp = from;
            from = to;
            to = tmp;
            speedRatio = -speedRatio;
        }
        // if from > to switch speed ratio
        if (from > to) {
            speedRatio = -speedRatio;
        }
        const animatable = new Animatable(this, target, from, to, loop, speedRatio, onAnimationEnd, animations, onAnimationLoop, isAdditive);

        return animatable;
    };

    sceneClass.prototype.beginDirectHierarchyAnimation = function (
        target: Node,
        directDescendantsOnly: boolean,
        animations: Animation[],
        from: number,
        to: number,
        loop?: boolean,
        speedRatio?: number,
        onAnimationEnd?: () => void,
        onAnimationLoop?: () => void,
        isAdditive = false
    ): Animatable[] {
        const children = target.getDescendants(directDescendantsOnly);

        const result = [];
        result.push(this.beginDirectAnimation(target, animations, from, to, loop, speedRatio, onAnimationEnd, onAnimationLoop, isAdditive));
        for (const child of children) {
            result.push(this.beginDirectAnimation(child, animations, from, to, loop, speedRatio, onAnimationEnd, onAnimationLoop, isAdditive));
        }

        return result;
    };

    sceneClass.prototype.getAnimatableByTarget = function (target: any): Nullable<Animatable> {
        for (let index = 0; index < this._activeAnimatables.length; index++) {
            if (this._activeAnimatables[index].target === target) {
                return this._activeAnimatables[index];
            }
        }

        return null;
    };

    sceneClass.prototype.getAllAnimatablesByTarget = function (target: any): Array<Animatable> {
        const result = [];
        for (let index = 0; index < this._activeAnimatables.length; index++) {
            if (this._activeAnimatables[index].target === target) {
                result.push(this._activeAnimatables[index]);
            }
        }

        return result;
    };

    sceneClass.prototype.stopAnimation = function (target: any, animationName?: string, targetMask?: (target: any) => boolean): void {
        const animatables = this.getAllAnimatablesByTarget(target);

        for (const animatable of animatables) {
            animatable.stop(animationName, targetMask);
        }
    };

    sceneClass.prototype.stopAllAnimations = function (): void {
        if (this._activeAnimatables) {
            for (let i = 0; i < this._activeAnimatables.length; i++) {
                this._activeAnimatables[i].stop(undefined, undefined, true);
            }
            this._activeAnimatables.length = 0;
        }

        for (const group of this.animationGroups) {
            group.stop();
        }
    };
}
