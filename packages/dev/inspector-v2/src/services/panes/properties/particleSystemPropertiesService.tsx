import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import type { IPropertiesService } from "./propertiesService";

import { ParticleSystem } from "core/Particles";
import { ParticleSystemColorProperties, ParticleSystemEmissionProperties } from "../../../components/properties/particles/particleSystemProperties";
import { GetMetadataForDefaultSectionContent } from "./defaultSectionsMetadata";
import { PropertiesServiceIdentity } from "./propertiesService";

export const ParticleSystemPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService]> = {
    friendlyName: "Particle System Properties",
    consumes: [PropertiesServiceIdentity],
    factory: (propertiesService) => {
        // TODO-iv2 complete the ParticleSystemPropertiesService registrations and the ParticleSystemProperties component(s)

        const particleSystemContent = propertiesService.addSectionContent({
            key: "Particle System Properties",
            predicate: (entity: unknown): entity is ParticleSystem => entity instanceof ParticleSystem,
            content: [
                // "EMISSION" section.
                {
                    ...GetMetadataForDefaultSectionContent("emission", "particleSystem"),
                    component: ({ context }) => <ParticleSystemEmissionProperties particleSystem={context} />,
                },
                // "COLOR" section.
                {
                    ...GetMetadataForDefaultSectionContent("color", "particleSystem"),
                    component: ({ context }) => <ParticleSystemColorProperties particleSystem={context} />,
                },
            ],
        });
        return {
            dispose: () => {
                particleSystemContent.dispose();
            },
        };
    },
};
