import type { Behavior } from "../../Behaviors/behavior";
import type { Camera } from "../../Cameras/camera";
import type { ArcRotateCamera } from "../../Cameras/arcRotateCamera";
import { ExponentialEase, EasingFunction } from "../../Animations/easing";
import type { Observer } from "../../Misc/observable";
import { Observable } from "../../Misc/observable";
import type { Nullable } from "../../types";
import type { PointerInfoPre } from "../../Events/pointerEvents";
import { PointerEventTypes } from "../../Events/pointerEvents";
import { PrecisionDate } from "../../Misc/precisionDate";

import type { AbstractMesh } from "../../Meshes/abstractMesh";
import type { TransformNode } from "../../Meshes/transformNode";
import { Vector3 } from "../../Maths/math.vector";
import type { Animatable } from "../../Animations/animatable.core";
import { Animation } from "../../Animations/animation";

/**
 * The framing behavior (FramingBehavior) is designed to automatically position an ArcRotateCamera when its target is set to a mesh. It is also useful if you want to prevent the camera to go under a virtual horizontal plane.
 * @see https://doc.babylonjs.com/features/featuresDeepDive/behaviors/cameraBehaviors#framing-behavior
 */
export class FramingBehavior implements Behavior<ArcRotateCamera> {
    /**
     * Gets the name of the behavior.
     */
    public get name(): string {
        return "Framing";
    }

    /**
     * An event triggered when the animation to zoom on target mesh has ended
     */
    public onTargetFramingAnimationEndObservable = new Observable<void>();

    private _mode = FramingBehavior.FitFrustumSidesMode;
    private _radiusScale = 1.0;
    private _positionScale = 0.5;
    private _defaultElevation = 0.3;
    private _elevationReturnTime = 1500;
    private _elevationReturnWaitTime = 1000;
    private _zoomStopsAnimation = false;
    private _framingTime = 1500;

    /**
     * The easing function used by animations
     */
    public static EasingFunction = new ExponentialEase();

    /**
     * The easing mode used by animations
     */
    public static EasingMode = EasingFunction.EASINGMODE_EASEINOUT;

    /**
     * Sets the current mode used by the behavior
     */
    public set mode(mode: number) {
        this._mode = mode;
    }

    /**
     * Gets current mode used by the behavior.
     */
    public get mode(): number {
        return this._mode;
    }

    /**
     * Sets the scale applied to the radius (1 by default)
     */
    public set radiusScale(radius: number) {
        this._radiusScale = radius;
    }

    /**
     * Gets the scale applied to the radius
     */
    public get radiusScale(): number {
        return this._radiusScale;
    }

    /**
     * Sets the scale to apply on Y axis to position camera focus. 0.5 by default which means the center of the bounding box.
     */
    public set positionScale(scale: number) {
        this._positionScale = scale;
    }

    /**
     * Gets the scale to apply on Y axis to position camera focus. 0.5 by default which means the center of the bounding box.
     */
    public get positionScale(): number {
        return this._positionScale;
    }

    /**
     * Sets the angle above/below the horizontal plane to return to when the return to default elevation idle
     * behaviour is triggered, in radians.
     */
    public set defaultElevation(elevation: number) {
        this._defaultElevation = elevation;
    }

    /**
     * Gets the angle above/below the horizontal plane to return to when the return to default elevation idle
     * behaviour is triggered, in radians.
     */
    public get defaultElevation() {
        return this._defaultElevation;
    }

    /**
     * Sets the time (in milliseconds) taken to return to the default beta position.
     * Negative value indicates camera should not return to default.
     */
    public set elevationReturnTime(speed: number) {
        this._elevationReturnTime = speed;
    }

    /**
     * Gets the time (in milliseconds) taken to return to the default beta position.
     * Negative value indicates camera should not return to default.
     */
    public get elevationReturnTime(): number {
        return this._elevationReturnTime;
    }

    /**
     * Sets the delay (in milliseconds) taken before the camera returns to the default beta position.
     */
    public set elevationReturnWaitTime(time: number) {
        this._elevationReturnWaitTime = time;
    }

    /**
     * Gets the delay (in milliseconds) taken before the camera returns to the default beta position.
     */
    public get elevationReturnWaitTime(): number {
        return this._elevationReturnWaitTime;
    }

    /**
     * Sets the flag that indicates if user zooming should stop animation.
     */
    public set zoomStopsAnimation(flag: boolean) {
        this._zoomStopsAnimation = flag;
    }

    /**
     * Gets the flag that indicates if user zooming should stop animation.
     */
    public get zoomStopsAnimation(): boolean {
        return this._zoomStopsAnimation;
    }

    /**
     * Sets the transition time when framing the mesh, in milliseconds
     */
    public set framingTime(time: number) {
        this._framingTime = time;
    }

    /**
     * Gets the transition time when framing the mesh, in milliseconds
     */
    public get framingTime() {
        return this._framingTime;
    }

    /**
     * Define if the behavior should automatically change the configured
     * camera limits and sensibilities.
     */
    public autoCorrectCameraLimitsAndSensibility = true;

    // Default behavior functions
    private _onPrePointerObservableObserver: Nullable<Observer<PointerInfoPre>>;
    private _onAfterCheckInputsObserver: Nullable<Observer<Camera>>;
    private _onMeshTargetChangedObserver: Nullable<Observer<Nullable<TransformNode>>>;
    private _attachedCamera: Nullable<ArcRotateCamera>;
    private _isPointerDown = false;
    private _lastInteractionTime = -Infinity;

    /**
     * Initializes the behavior.
     */
    public init(): void {
        // Do nothing
    }

    /**
     * Attaches the behavior to its arc rotate camera.
     * @param camera Defines the camera to attach the behavior to
     */
    public attach(camera: ArcRotateCamera): void {
        this._attachedCamera = camera;
        const scene = this._attachedCamera.getScene();

        FramingBehavior.EasingFunction.setEasingMode(FramingBehavior.EasingMode);

        this._onPrePointerObservableObserver = scene.onPrePointerObservable.add((pointerInfoPre) => {
            if (pointerInfoPre.type === PointerEventTypes.POINTERDOWN) {
                this._isPointerDown = true;
                return;
            }

            if (pointerInfoPre.type === PointerEventTypes.POINTERUP) {
                this._isPointerDown = false;
            }
        });

        this._onMeshTargetChangedObserver = camera.onMeshTargetChangedObservable.add((transformNode) => {
            if (transformNode && (transformNode as AbstractMesh).getBoundingInfo) {
                this.zoomOnMesh(transformNode as AbstractMesh, undefined, () => {
                    this.onTargetFramingAnimationEndObservable.notifyObservers();
                });
            }
        });

        this._onAfterCheckInputsObserver = camera.onAfterCheckInputsObservable.add(() => {
            // Stop the animation if there is user interaction and the animation should stop for this interaction
            this._applyUserInteraction();

            // Maintain the camera above the ground. If the user pulls the camera beneath the ground plane, lift it
            // back to the default position after a given timeout
            this._maintainCameraAboveGround();
        });
    }

    /**
     * Detaches the behavior from its current arc rotate camera.
     */
    public detach(): void {
        if (!this._attachedCamera) {
            return;
        }

        const scene = this._attachedCamera.getScene();

        if (this._onPrePointerObservableObserver) {
            scene.onPrePointerObservable.remove(this._onPrePointerObservableObserver);
        }

        if (this._onAfterCheckInputsObserver) {
            this._attachedCamera.onAfterCheckInputsObservable.remove(this._onAfterCheckInputsObserver);
        }

        if (this._onMeshTargetChangedObserver) {
            this._attachedCamera.onMeshTargetChangedObservable.remove(this._onMeshTargetChangedObserver);
        }

        this._attachedCamera = null;
    }

    // Framing control
    private _animatables = new Array<Animatable>();
    private _betaIsAnimating = false;
    private _betaTransition: Animation;
    private _radiusTransition: Animation;
    private _vectorTransition: Animation;

    /**
     * Targets the given mesh and updates zoom level accordingly.
     * @param mesh  The mesh to target.
     * @param focusOnOriginXZ Determines if the camera should focus on 0 in the X and Z axis instead of the mesh
     * @param onAnimationEnd Callback triggered at the end of the framing animation
     */
    public zoomOnMesh(mesh: AbstractMesh, focusOnOriginXZ: boolean = false, onAnimationEnd: Nullable<() => void> = null): void {
        mesh.computeWorldMatrix(true);

        const boundingBox = mesh.getBoundingInfo().boundingBox;
        this.zoomOnBoundingInfo(boundingBox.minimumWorld, boundingBox.maximumWorld, focusOnOriginXZ, onAnimationEnd);
    }

    /**
     * Targets the given mesh with its children and updates zoom level accordingly.
     * @param mesh The mesh to target.
     * @param focusOnOriginXZ Determines if the camera should focus on 0 in the X and Z axis instead of the mesh
     * @param onAnimationEnd Callback triggered at the end of the framing animation
     */
    public zoomOnMeshHierarchy(mesh: AbstractMesh, focusOnOriginXZ: boolean = false, onAnimationEnd: Nullable<() => void> = null): void {
        mesh.computeWorldMatrix(true);

        const boundingBox = mesh.getHierarchyBoundingVectors(true);
        this.zoomOnBoundingInfo(boundingBox.min, boundingBox.max, focusOnOriginXZ, onAnimationEnd);
    }

    /**
     * Targets the given meshes with their children and updates zoom level accordingly.
     * @param meshes  The mesh to target.
     * @param focusOnOriginXZ Determines if the camera should focus on 0 in the X and Z axis instead of the mesh
     * @param onAnimationEnd Callback triggered at the end of the framing animation
     */
    public zoomOnMeshesHierarchy(meshes: AbstractMesh[], focusOnOriginXZ: boolean = false, onAnimationEnd: Nullable<() => void> = null): void {
        const min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
        const max = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

        for (let i = 0; i < meshes.length; i++) {
            const boundingInfo = meshes[i].getHierarchyBoundingVectors(true);
            Vector3.CheckExtends(boundingInfo.min, min, max);
            Vector3.CheckExtends(boundingInfo.max, min, max);
        }

        this.zoomOnBoundingInfo(min, max, focusOnOriginXZ, onAnimationEnd);
    }

    /**
     * Targets the bounding box info defined by its extends and updates zoom level accordingly.
     * @param minimumWorld Determines the smaller position of the bounding box extend
     * @param maximumWorld Determines the bigger position of the bounding box extend
     * @param focusOnOriginXZ Determines if the camera should focus on 0 in the X and Z axis instead of the mesh
     * @param onAnimationEnd Callback triggered at the end of the framing animation
     * @returns true if the zoom was done
     */
    public zoomOnBoundingInfo(minimumWorld: Vector3, maximumWorld: Vector3, focusOnOriginXZ: boolean = false, onAnimationEnd: Nullable<() => void> = null): boolean {
        let zoomTarget: Vector3;

        if (!this._attachedCamera) {
            return false;
        }

        // Find target by interpolating from bottom of bounding box in world-space to top via framingPositionY
        const bottom = minimumWorld.y;
        const top = maximumWorld.y;
        const zoomTargetY = bottom + (top - bottom) * this._positionScale;
        const radiusWorld = maximumWorld.subtract(minimumWorld).scale(0.5);

        if (!isFinite(zoomTargetY)) {
            return false; // Abort mission as there is no target
        }

        if (focusOnOriginXZ) {
            zoomTarget = new Vector3(0, zoomTargetY, 0);
        } else {
            const centerWorld = minimumWorld.add(radiusWorld);
            zoomTarget = new Vector3(centerWorld.x, zoomTargetY, centerWorld.z);
        }

        if (!this._vectorTransition) {
            this._vectorTransition = Animation.CreateAnimation("target", Animation.ANIMATIONTYPE_VECTOR3, 60, FramingBehavior.EasingFunction);
        }

        this._betaIsAnimating = true;
        let animatable = Animation.TransitionTo("target", zoomTarget, this._attachedCamera, this._attachedCamera.getScene(), 60, this._vectorTransition, this._framingTime);
        if (animatable) {
            this._animatables.push(animatable);
        }

        // sets the radius and lower radius bounds
        // Small delta ensures camera is not always at lower zoom limit.
        let radius = 0;
        if (this._mode === FramingBehavior.FitFrustumSidesMode) {
            const position = this._calculateLowerRadiusFromModelBoundingSphere(minimumWorld, maximumWorld);
            if (this.autoCorrectCameraLimitsAndSensibility) {
                this._attachedCamera.lowerRadiusLimit = radiusWorld.length() + this._attachedCamera.minZ;
            }
            radius = position;
        } else if (this._mode === FramingBehavior.IgnoreBoundsSizeMode) {
            radius = this._calculateLowerRadiusFromModelBoundingSphere(minimumWorld, maximumWorld);
            if (this.autoCorrectCameraLimitsAndSensibility && this._attachedCamera.lowerRadiusLimit === null) {
                this._attachedCamera.lowerRadiusLimit = this._attachedCamera.minZ;
            }
        }

        // Set sensibilities
        if (this.autoCorrectCameraLimitsAndSensibility) {
            const extend = maximumWorld.subtract(minimumWorld).length();
            this._attachedCamera.panningSensibility = 5000 / extend;
            this._attachedCamera.wheelPrecision = 100 / radius;
        }

        // transition to new radius
        if (!this._radiusTransition) {
            this._radiusTransition = Animation.CreateAnimation("radius", Animation.ANIMATIONTYPE_FLOAT, 60, FramingBehavior.EasingFunction);
        }

        animatable = Animation.TransitionTo("radius", radius, this._attachedCamera, this._attachedCamera.getScene(), 60, this._radiusTransition, this._framingTime, () => {
            this.stopAllAnimations();
            if (onAnimationEnd) {
                onAnimationEnd();
            }

            if (this._attachedCamera && this._attachedCamera.useInputToRestoreState) {
                this._attachedCamera.storeState();
            }
        });

        if (animatable) {
            this._animatables.push(animatable);
        }

        return true;
    }

    /**
     * Calculates the lowest radius for the camera based on the bounding box of the mesh.
     * @param minimumWorld
     * @param maximumWorld
     * @returns The minimum distance from the primary mesh's center point at which the camera must be kept in order
     *		 to fully enclose the mesh in the viewing frustum.
     */
    protected _calculateLowerRadiusFromModelBoundingSphere(minimumWorld: Vector3, maximumWorld: Vector3): number {
        const camera = this._attachedCamera;

        if (!camera) {
            return 0;
        }

        let distance = camera._calculateLowerRadiusFromModelBoundingSphere(minimumWorld, maximumWorld, this._radiusScale);
        if (camera.lowerRadiusLimit && this._mode === FramingBehavior.IgnoreBoundsSizeMode) {
            // Don't exceed the requested limit
            distance = distance < camera.lowerRadiusLimit ? camera.lowerRadiusLimit : distance;
        }

        // Don't exceed the upper radius limit
        if (camera.upperRadiusLimit) {
            distance = distance > camera.upperRadiusLimit ? camera.upperRadiusLimit : distance;
        }

        return distance;
    }

    /**
     * Keeps the camera above the ground plane. If the user pulls the camera below the ground plane, the camera
     * is automatically returned to its default position (expected to be above ground plane).
     */
    private _maintainCameraAboveGround(): void {
        if (this._elevationReturnTime < 0) {
            return;
        }

        const timeSinceInteraction = PrecisionDate.Now - this._lastInteractionTime;
        const defaultBeta = Math.PI * 0.5 - this._defaultElevation;
        const limitBeta = Math.PI * 0.5;

        // Bring the camera back up if below the ground plane
        if (this._attachedCamera && !this._betaIsAnimating && this._attachedCamera.beta > limitBeta && timeSinceInteraction >= this._elevationReturnWaitTime) {
            this._betaIsAnimating = true;

            //Transition to new position
            this.stopAllAnimations();

            if (!this._betaTransition) {
                this._betaTransition = Animation.CreateAnimation("beta", Animation.ANIMATIONTYPE_FLOAT, 60, FramingBehavior.EasingFunction);
            }

            const animatable = Animation.TransitionTo(
                "beta",
                defaultBeta,
                this._attachedCamera,
                this._attachedCamera.getScene(),
                60,
                this._betaTransition,
                this._elevationReturnTime,
                () => {
                    this._clearAnimationLocks();
                    this.stopAllAnimations();
                }
            );

            if (animatable) {
                this._animatables.push(animatable);
            }
        }
    }

    /**
     * Removes all animation locks. Allows new animations to be added to any of the arcCamera properties.
     */
    private _clearAnimationLocks(): void {
        this._betaIsAnimating = false;
    }

    /**
     *  Applies any current user interaction to the camera. Takes into account maximum alpha rotation.
     */
    private _applyUserInteraction(): void {
        if (this.isUserIsMoving) {
            this._lastInteractionTime = PrecisionDate.Now;
            this.stopAllAnimations();
            this._clearAnimationLocks();
        }
    }

    /**
     * Stops and removes all animations that have been applied to the camera
     */
    public stopAllAnimations(): void {
        if (this._attachedCamera) {
            this._attachedCamera.animations = [];
        }

        while (this._animatables.length) {
            if (this._animatables[0]) {
                this._animatables[0].onAnimationEnd = null;
                this._animatables[0].stop();
            }
            this._animatables.shift();
        }
    }

    /**
     * Gets a value indicating if the user is moving the camera
     */
    public get isUserIsMoving(): boolean {
        if (!this._attachedCamera) {
            return false;
        }

        return (
            this._attachedCamera.inertialAlphaOffset !== 0 ||
            this._attachedCamera.inertialBetaOffset !== 0 ||
            this._attachedCamera.inertialRadiusOffset !== 0 ||
            this._attachedCamera.inertialPanningX !== 0 ||
            this._attachedCamera.inertialPanningY !== 0 ||
            this._isPointerDown
        );
    }

    // Statics

    /**
     * The camera can move all the way towards the mesh.
     */
    public static IgnoreBoundsSizeMode = 0;

    /**
     * The camera is not allowed to zoom closer to the mesh than the point at which the adjusted bounding sphere touches the frustum sides
     */
    public static FitFrustumSidesMode = 1;
}
