import type { ServiceDefinition } from "../../../../modularity/serviceDefinition";
import type { IPropertiesService } from "../propertiesService";

import { SpotLight } from "core/Lights/spotLight";

import { SpotLightSetupProperties } from "../../../../components/properties/lights/spotLightSetupProperties";
import { GetMetadataForDefaultSectionContent } from "../defaultSectionsMetadata";
import { PropertiesServiceIdentity } from "../propertiesService";

export const SpotLightPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService]> = {
    friendlyName: "Spot Lights Properties",
    consumes: [PropertiesServiceIdentity],
    factory: (propertiesService) => {
        const contentRegistration = propertiesService.addSectionContent({
            key: "Spot Light Properties",
            predicate: (entity: unknown) => entity instanceof SpotLight,
            content: [
                // "SETUP" section.
                {
                    ...GetMetadataForDefaultSectionContent("setup", "spotLight"),
                    component: SpotLightSetupProperties,
                },
            ],
        });

        return {
            dispose: () => {
                contentRegistration.dispose();
            },
        };
    },
};
