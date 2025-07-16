import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import type { IPropertiesService } from "./propertiesService";
import type { ISelectionService } from "../../selectionService";

import { PropertiesServiceIdentity } from "./propertiesService";
import { SelectionServiceIdentity } from "../../selectionService";

import { Material } from "core/Materials";
import { GetMetadataForDefaultSectionContent } from "./defaultSectionsMetadata";
import { MaterialTransparencyProperties } from "../../../components/properties/materials/materialTransparencyProperties";

export const MaterialPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService, ISelectionService]> = {
    friendlyName: "Material Properties",
    consumes: [PropertiesServiceIdentity, SelectionServiceIdentity],
    factory: (propertiesService) => {
        const materialContentRegistration = propertiesService.addSectionContent({
            key: "Material Properties",
            predicate: (entity: unknown): entity is Material => entity instanceof Material,
            content: [
                // "Transparency" section.
                {
                    ...GetMetadataForDefaultSectionContent("transparency", "material"),
                    component: ({ context }) => <MaterialTransparencyProperties material={context} />,
                },
            ],
        });

        return {
            dispose: () => {
                materialContentRegistration.dispose();
            },
        };
    },
};
