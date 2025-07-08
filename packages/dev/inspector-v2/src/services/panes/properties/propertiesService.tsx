import type { ComponentType } from "react";

import type { IDisposable } from "core/index";

import type { AccordionSection, AccordionSectionContent } from "../../../components/accordionPane";
import type { IService, ServiceDefinition } from "../../../modularity/serviceDefinition";
import type { ISelectionService } from "../../selectionService";
import type { IShellService } from "../../shellService";

import { DocumentTextRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";

import { PropertiesPane } from "../../../components/properties/propertiesPane";
import { useObservableCollection, useObservableState, useOrderedObservableCollection } from "../../../hooks/observableHooks";
import { ObservableCollection } from "../../../misc/observableCollection";
import { SelectionServiceIdentity } from "../../selectionService";
import { ShellServiceIdentity } from "../../shellService";

export const PropertiesServiceIdentity = Symbol("PropertiesService");

type PropertiesSectionContent<EntityT> = Readonly<{
    /**
     * A unique key for the the content.
     */
    key: string;

    /**
     * A predicate function to determine if the content applies to the given entity.
     */
    predicate: (entity: unknown) => entity is EntityT;

    content: readonly Readonly<
        {
            /**
             * The section this content belongs to.
             */
            section: symbol;

            /**
             * An optional order for the content within the section.
             * Defaults to 0.
             */
            order?: number;
        } & (
            | {
                  /**
                   * Indicates the component renders unconditionally.
                   * This means the containing section will be visible if this component applies to the entity.
                   */
                  conditional?: false | undefined;

                  /**
                   * The React component that will be rendered for this content.
                   */
                  component: ComponentType<{ context: EntityT }>;
              }
            | {
                  /**
                   * Indicates the component renders conditionally.
                   * This means the presence of this component will only cause the containing section to be visible if the component calls the show function passed in with the props.
                   */
                  conditional: true;

                  /**
                   * The React component that will be rendered for this content.
                   */
                  component: ComponentType<{ context: EntityT; show: () => void; hide: () => void }>;
              }
        )
    >[];
}>;

/**
 * Allows new sections or content to be added to the properties pane.
 */
export interface IPropertiesService extends IService<typeof PropertiesServiceIdentity> {
    /**
     * Adds a new section (e.g. "General", "Transforms", etc.).
     * @param section A description of the section to add.
     */
    addSection(section: AccordionSection): IDisposable;

    /**
     * Adds content to one or more sections.
     * @param content A description of the content to add.
     */
    addSectionContent<EntityT>(content: PropertiesSectionContent<EntityT>): IDisposable;
}

/**
 * Provides a properties pane that enables displaying and editing properties of an entity such as a mesh or a texture.
 */
export const PropertiesServiceDefinition: ServiceDefinition<[IPropertiesService], [IShellService, ISelectionService]> = {
    friendlyName: "Properties Editor",
    produces: [PropertiesServiceIdentity],
    consumes: [ShellServiceIdentity, SelectionServiceIdentity],
    factory: (shellService, selectionService) => {
        const sectionsCollection = new ObservableCollection<AccordionSection>();
        const sectionContentCollection = new ObservableCollection<PropertiesSectionContent<unknown>>();

        const registration = shellService.addSidePane({
            key: "Properties",
            title: "Properties",
            icon: DocumentTextRegular,
            horizontalLocation: "right",
            order: 100,
            suppressTeachingMoment: true,
            content: () => {
                const sections = useOrderedObservableCollection(sectionsCollection);
                const sectionContent = useObservableCollection(sectionContentCollection);
                const entity = useObservableState(() => selectionService.selectedEntity, selectionService.onSelectedEntityChanged);

                const [contentVisibility, setContentVisibility] = useState(new Map<string, boolean>());
                useEffect(() => {
                    setContentVisibility(new Map());
                }, [entity, sectionContent]);

                const applicableContent = useMemo(() => {
                    if (!entity) {
                        return [];
                    }

                    return sectionContent
                        .filter((section) => section.predicate(entity))
                        .flatMap((section) => {
                            return section.content.map((content) => {
                                const visibilityKey = `${content.section.description}-${section.key}`;
                                const getIsVisible = () => contentVisibility.get(visibilityKey) !== false;
                                const setIsVisible = (isVisible: boolean) => {
                                    // If the content component is being rendered as part of this component being rendered,
                                    // then it is invalid to mutate the state of this component. To protect against this,
                                    // just defer with state change with queueMicrotask.
                                    queueMicrotask(() => {
                                        if (getIsVisible() !== isVisible) {
                                            const newContentVisibility = new Map(contentVisibility);
                                            if (isVisible) {
                                                newContentVisibility.set(visibilityKey, true);
                                            } else {
                                                newContentVisibility.set(visibilityKey, false);
                                            }
                                            setContentVisibility(newContentVisibility);
                                        }
                                    });
                                };

                                // If this is the very first render, then initially hide any conditional content so it doesn't "flicker"
                                // (e.g. render visibly once before we know that it should actually be hidden). This means conditional
                                // content must explicitly call the show function to become visible.
                                if (content.conditional && !contentVisibility.has(visibilityKey)) {
                                    contentVisibility.set(visibilityKey, false);
                                }

                                return {
                                    key: section.key,
                                    section: content.section,
                                    get isVisible() {
                                        return getIsVisible();
                                    },
                                    component: () => {
                                        return <content.component context={entity} show={() => setIsVisible(true)} hide={() => setIsVisible(false)} />;
                                    },
                                };
                            });
                        });
                }, [entity, sectionContent, contentVisibility]);

                return (
                    <>
                        <PropertiesPane sections={sections} sectionContent={applicableContent.filter((content) => content.isVisible)} context={entity} />
                        {/* Render the components that are not visible since their rendering logic is what determines visibility.
                            Since they are rendered in a div with display: "none", they will not actually be visible or even have elements in the dom tree. */}
                        <div style={{ display: "none" }}>
                            {applicableContent
                                .filter((content) => !content.isVisible)
                                .map((content) => (
                                    <content.component key={`${content.section.description}-${content.key}`} />
                                ))}
                        </div>
                    </>
                );
            },
        });

        return {
            addSection: (section) => sectionsCollection.add(section),
            addSectionContent: (content) => sectionContentCollection.add(content as PropertiesSectionContent<unknown>),
            dispose: () => registration.dispose(),
        };
    },
};
