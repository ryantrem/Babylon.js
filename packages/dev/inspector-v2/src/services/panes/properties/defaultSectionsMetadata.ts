export const GeneralPropertiesSectionIdentity = Symbol("General");

export const TransformPropertiesSectionIdentity = Symbol("Transform");

export const AnimationSectionIdentity = Symbol("Animation");

export const SetupPropertiesSectionIdentity = Symbol("Setup");
export const ShadowsPropertiesSectionIdentity = Symbol("Shadows");
export const ShadowGeneratorPropertiesSectionIdentity = Symbol("Shadow Generator");

export const AdvancedPropertiesSectionIdentity = Symbol("Advanced");
export const OutlineOverlayPropertiesSectionIdentity = Symbol("Outline & Overlay");
export const PhysicsPropertiesSectionIdentity = Symbol("Physics");
export const SkeletonViewerPropertiesSectionIdentity = Symbol("Viewer");

export const TransparencyPropertiesSectionIdentity = Symbol("Transparency");
export const StencilPropertiesSectionIdentity = Symbol("Stencil");

export const EmissionSectionIdentity = Symbol("Emission");
export const ColorSectionIdentity = Symbol("Color");

// NOTE: This defines all the default sections, and the default content for each section.
// Sections have a *stable* order, so that extensions can insert new sections in the order of their choice (between two existing sections, for example).
// Content within each sections has a *stable* order, so that extensions can insert new content in the order of their choice (between two existing content items, for example).
// When sections or content within a section are mutually exclusive (e.g. area light and directional light properties will never be displayed at the same time), they can have the same order values.

export const DefaultSections = {
    general: {
        identity: GeneralPropertiesSectionIdentity,
        order: 100,
        collapseByDefault: false,
        contentOrder: {
            common: 100,
            node: 200,
            abstractMesh: 300,
            skeleton: 200,
            sprite: 200,
        },
    },
    transform: {
        identity: TransformPropertiesSectionIdentity,
        order: 200,
        collapseByDefault: false,
        contentOrder: {
            transformable: 100,
            sprite: 100,
        },
    },
    skeletonViewer: {
        identity: SkeletonViewerPropertiesSectionIdentity,
        order: 200,
        collapseByDefault: false,
        contentOrder: {
            skeleton: 100,
        },
    },
    transparency: {
        identity: TransparencyPropertiesSectionIdentity,
        order: 200,
        collapseByDefault: false,
        contentOrder: {
            material: 100,
        },
    },
    stencil: {
        identity: StencilPropertiesSectionIdentity,
        order: 300,
        collapseByDefault: false,
        contentOrder: {
            material: 100,
        },
    },
    emission: {
        identity: EmissionSectionIdentity,
        order: 200,
        collapseByDefault: false,
        contentOrder: {
            particleSystem: 100,
        },
    },
    color: {
        identity: ColorSectionIdentity,
        order: 300,
        collapseByDefault: false,
        contentOrder: {
            particleSystem: 100,
            sprite: 100,
        },
    },
    animation: {
        identity: AnimationSectionIdentity,
        order: 300,
        collapseByDefault: false,
        contentOrder: {
            animatable: 100,
            sprite: 100,
        },
    },
    advanced: {
        identity: AdvancedPropertiesSectionIdentity,
        order: 400,
        collapseByDefault: false,
        contentOrder: {
            abstractMesh: 100,
        },
    },
    outlineOverlay: {
        identity: OutlineOverlayPropertiesSectionIdentity,
        order: 500,
        collapseByDefault: false,
        contentOrder: {
            mesh: 100,
        },
    },
    physics: {
        identity: PhysicsPropertiesSectionIdentity,
        order: 600,
        collapseByDefault: false,
        contentOrder: {
            transformNode: 100,
        },
    },
    setup: {
        identity: SetupPropertiesSectionIdentity,
        order: 400,
        collapseByDefault: false,
        contentOrder: {
            areaLight: 100,
            hemisphericLight: 100,
            directionalLight: 100,
            pointLight: 100,
            spotLight: 100,
        },
    },
    shadows: {
        identity: ShadowsPropertiesSectionIdentity,
        order: 500,
        collapseByDefault: false,
        contentOrder: {
            shadowLight: 100,
        },
    },
    shadowGenerator: {
        identity: ShadowGeneratorPropertiesSectionIdentity,
        order: 600,
        collapseByDefault: false,
        contentOrder: {
            shadowGenerator: 100,
        },
    },
} as const;

export function GetMetadataForDefaultSectionContent<SectionT extends keyof typeof DefaultSections, ContentT extends keyof (typeof DefaultSections)[SectionT]["contentOrder"]>(
    section: SectionT,
    contentKey: ContentT
) {
    const sectionMetadata = DefaultSections[section];
    return {
        section: sectionMetadata.identity,
        order: sectionMetadata.contentOrder[contentKey as keyof typeof sectionMetadata.contentOrder],
    };
}
