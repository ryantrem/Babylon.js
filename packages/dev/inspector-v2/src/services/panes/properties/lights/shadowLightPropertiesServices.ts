import type { ServiceDefinition } from "../../../../modularity/serviceDefinition";
import type { IPropertiesService } from "../propertiesService";

import { ShadowLight } from "core/Lights/shadowLight";

import { ShadowGeneratorSetupProperties } from "../../../../components/properties/lights/shadowGeneratorSetupProperties";
import { ShadowsSetupProperties } from "../../../../components/properties/lights/shadowsSetupProperties";
import { GetMetadataForDefaultSectionContent } from "../defaultSectionsMetadata";
import { PropertiesServiceIdentity } from "../propertiesService";

export const ShadowLightPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService]> = {
    friendlyName: "Shadow Lights Properties",
    consumes: [PropertiesServiceIdentity],
    factory: (propertiesService) => {
        const shadowContentRegistration = propertiesService.addSectionContent({
            key: "Shadow Light Shadow Properties",
            predicate: (entity: unknown) => entity instanceof ShadowLight,
            content: [
                // "SHADOWS" section.
                {
                    ...GetMetadataForDefaultSectionContent("shadows", "shadowLight"),
                    component: ShadowsSetupProperties,
                },
            ],
        });

        const shadowGeneratorContentRegistration = propertiesService.addSectionContent({
            key: "Shadow Light Shadow Generator Properties",
            predicate: (entity: unknown) => entity instanceof ShadowLight,
            content: [
                // "SHADOW GENERATOR" section.
                {
                    ...GetMetadataForDefaultSectionContent("shadowGenerator", "shadowGenerator"),
                    component: ShadowGeneratorSetupProperties,
                },
            ],
        });

        return {
            dispose: () => {
                shadowContentRegistration.dispose();
                shadowGeneratorContentRegistration.dispose();
            },
        };
    },
};
