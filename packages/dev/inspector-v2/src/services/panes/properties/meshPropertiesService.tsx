import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import type { ISelectionService } from "../../selectionService";
import type { IPropertiesService } from "./propertiesService";

import { Mesh } from "core/Meshes";
import { AbstractMesh } from "core/Meshes/abstractMesh";

import { MeshAdvancedProperties } from "../../../components/properties/mesh/meshAdvancedProperties";
import { MeshGeneralProperties } from "../../../components/properties/mesh/meshGeneralProperties";
import { MeshOutlineOverlayProperties } from "../../../components/properties/mesh/meshOutlineOverlayProperties";
import { SelectionServiceIdentity } from "../../selectionService";
import { GetMetadataForDefaultSectionContent } from "./defaultSectionsMetadata";
import { PropertiesServiceIdentity } from "./propertiesService";

export const MeshPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService, ISelectionService]> = {
    friendlyName: "Mesh Properties",
    consumes: [PropertiesServiceIdentity, SelectionServiceIdentity],
    factory: (propertiesService, selectionService) => {
        const abstractMeshContentRegistration = propertiesService.addSectionContent({
            key: "Abstract Mesh Properties",
            // Meshes without vertices are effectively TransformNodes, so don't add mesh properties for them.
            predicate: (entity: unknown): entity is AbstractMesh => entity instanceof AbstractMesh && entity.getTotalVertices() > 0,
            content: [
                // "GENERAL" section.
                {
                    ...GetMetadataForDefaultSectionContent("general", "abstractMesh"),
                    component: ({ context }) => <MeshGeneralProperties mesh={context} selectionService={selectionService} />,
                },

                // "ADVANCED" section.
                {
                    ...GetMetadataForDefaultSectionContent("advanced", "abstractMesh"),
                    component: ({ context }) => <MeshAdvancedProperties mesh={context} />,
                },
            ],
        });

        const meshPropertiesContentRegistration = propertiesService.addSectionContent({
            key: "Mesh Properties",
            predicate: (entity: unknown): entity is Mesh => entity instanceof Mesh,
            content: [
                // "OUTLINES & OVERLAYS" section.
                {
                    ...GetMetadataForDefaultSectionContent("outlineOverlay", "mesh"),
                    component: ({ context }) => <MeshOutlineOverlayProperties mesh={context} />,
                },
            ],
        });

        return {
            dispose: () => {
                abstractMeshContentRegistration.dispose();
                meshPropertiesContentRegistration.dispose();
            },
        };
    },
};
