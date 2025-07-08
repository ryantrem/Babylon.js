import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import type { IPropertiesService } from "./propertiesService";

import { TransformNode } from "core/Meshes/transformNode";

import { TransformNodePhysicsProperties } from "../../../components/properties/physicsProperties";
import { useProperty } from "../../../hooks/compoundPropertyHooks";
import { PropertiesServiceIdentity } from "./propertiesService";

export const PhysicsPropertiesSectionIdentity = Symbol("Physics");

export const PhysicsPropertiesServiceDefinition: ServiceDefinition<[], [IPropertiesService]> = {
    friendlyName: "Physics Properties",
    consumes: [PropertiesServiceIdentity],
    factory: (propertiesService) => {
        const physicsSectionRegistration = propertiesService.addSection({
            order: 1,
            identity: PhysicsPropertiesSectionIdentity,
        });

        const contentRegistration = propertiesService.addSectionContent({
            key: "Physics Properties",
            predicate: (entity: unknown) => entity instanceof TransformNode,
            content: [
                // "Physics" section.
                {
                    section: PhysicsPropertiesSectionIdentity,
                    order: 0,
                    conditional: true,
                    component: ({ context: node, show, hide }) => {
                        const physicsBody = useProperty(node, "physicsBody");

                        if (!physicsBody) {
                            hide();
                            return null;
                        }

                        show();
                        return <TransformNodePhysicsProperties physicsBody={physicsBody} />;
                    },
                },
            ],
        });

        return {
            dispose: () => {
                contentRegistration.dispose();
                physicsSectionRegistration.dispose();
            },
        };
    },
};
