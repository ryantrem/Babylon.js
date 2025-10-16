import type { IDisposable, Scene } from "core/index";
import type { DynamicAccordionSection, DynamicAccordionSectionContent } from "../../components/extensibleAccordion";
import type { IService, ServiceDefinition } from "../../modularity/serviceDefinition";
import type { ISceneContext } from "../sceneContext";
import type { ISettingsContext } from "../settingsContext";
import type { IShellService } from "../shellService";

import { SettingsRegular } from "@fluentui/react-icons";

import { DataStorage } from "core/Misc/dataStorage";
import { Observable } from "core/Misc/observable";
import { SwitchPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/switchPropertyLine";
import { AccordionSection } from "shared-ui-components/fluent/primitives/accordion";
import { ExtensibleAccordion } from "../../components/extensibleAccordion";
import { useObservableCollection, useObservableState, useOrderedObservableCollection } from "../../hooks/observableHooks";
import { ObservableCollection } from "../../misc/observableCollection";
import { SceneContextIdentity } from "../sceneContext";
import { SettingsContextIdentity } from "../settingsContext";
import { ShellServiceIdentity } from "../shellService";

import { TempSizeContext } from "../../contexts/testContext";
import type { IReactContextService } from "../reactContextService";
import { ReactContextServiceIdentity } from "../reactContextService";

export const SettingsServiceIdentity = Symbol("SettingsService");

/**
 * Allows new sections or content to be added to the Settings pane.
 */
export interface ISettingsService extends IService<typeof SettingsServiceIdentity> {
    /**
     * Adds a new section.
     * @param section A description of the section to add.
     */
    addSection(section: DynamicAccordionSection): IDisposable;

    /**
     * Adds content to one or more sections.
     * @param content A description of the content to add.
     */
    addSectionContent(content: DynamicAccordionSectionContent<Scene>): IDisposable;
}

export const SettingsServiceDefinition: ServiceDefinition<[ISettingsContext, ISettingsService], [IShellService, ISceneContext, IReactContextService]> = {
    friendlyName: "Settings",
    consumes: [ShellServiceIdentity, SceneContextIdentity, ReactContextServiceIdentity],
    produces: [SettingsContextIdentity, SettingsServiceIdentity],
    factory: (shellService, sceneContext, reactContextService) => {
        const sectionsCollection = new ObservableCollection<DynamicAccordionSection>();
        const sectionContentCollection = new ObservableCollection<DynamicAccordionSectionContent<Scene>>();

        let useDegrees = DataStorage.ReadBoolean("Babylon/Settings/UseDegrees", false);
        let ignoreBackfacesForPicking = DataStorage.ReadBoolean("Babylon/Settings/IgnoreBackfacesForPicking", false);
        let showPropertiesOnEntitySelection = DataStorage.ReadBoolean("Babylon/Settings/ShowPropertiesOnEntitySelection", true);
        let isCompactMode = DataStorage.ReadBoolean("Babylon/Settings/IsCompactMode", !matchMedia("(pointer: coarse)").matches);

        const sizeModeContextRegistration = reactContextService.addProvider(TempSizeContext.Provider, () => (isCompactMode ? "small" : "large"));

        const settings = {
            get useDegrees() {
                return useDegrees;
            },
            set useDegrees(value: boolean) {
                if (useDegrees === value) {
                    return; // No change, no need to notify
                }
                useDegrees = value;

                DataStorage.WriteBoolean("Babylon/Settings/UseDegrees", useDegrees);

                this.settingsChangedObservable.notifyObservers(this);
            },
            get ignoreBackfacesForPicking() {
                return ignoreBackfacesForPicking;
            },
            set ignoreBackfacesForPicking(value: boolean) {
                if (ignoreBackfacesForPicking === value) {
                    return; // No change, no need to notify
                }
                ignoreBackfacesForPicking = value;

                DataStorage.WriteBoolean("Babylon/Settings/IgnoreBackfacesForPicking", ignoreBackfacesForPicking);
                this.settingsChangedObservable.notifyObservers(this);
            },
            get showPropertiesOnEntitySelection() {
                return showPropertiesOnEntitySelection;
            },
            set showPropertiesOnEntitySelection(value: boolean) {
                if (showPropertiesOnEntitySelection === value) {
                    return; // No change, no need to notify
                }
                showPropertiesOnEntitySelection = value;

                DataStorage.WriteBoolean("Babylon/Settings/ShowPropertiesOnEntitySelection", showPropertiesOnEntitySelection);
                this.settingsChangedObservable.notifyObservers(this);
            },
            get isCompactMode() {
                return isCompactMode;
            },
            set isCompactMode(value: boolean) {
                if (isCompactMode === value) {
                    return; // No change, no need to notify
                }
                isCompactMode = value;

                sizeModeContextRegistration.updateValue();
                DataStorage.WriteBoolean("Babylon/Settings/IsCompactMode", isCompactMode);
                this.settingsChangedObservable.notifyObservers(this);
            },
            settingsChangedObservable: new Observable<ISettingsContext>(),
            addSection: (section: DynamicAccordionSection) => sectionsCollection.add(section),
            addSectionContent: (content: DynamicAccordionSectionContent<Scene>) => sectionContentCollection.add(content),
            dispose: () => {},
        };

        const sidePaneRegistration = shellService.addSidePane({
            key: "Settings",
            title: "Settings",
            icon: SettingsRegular,
            horizontalLocation: "right",
            verticalLocation: "top",
            order: 500,
            suppressTeachingMoment: true,
            content: () => {
                const sections = useOrderedObservableCollection(sectionsCollection);
                const sectionContent = useObservableCollection(sectionContentCollection);
                const scene = useObservableState(() => sceneContext.currentScene, sceneContext.currentSceneObservable);

                return (
                    <>
                        {scene && (
                            <ExtensibleAccordion sections={sections} sectionContent={sectionContent} context={scene}>
                                <AccordionSection title="UI">
                                    <SwitchPropertyLine
                                        label="Use Degrees"
                                        description="Using degrees instead of radians."
                                        value={settings.useDegrees}
                                        onChange={(checked) => {
                                            settings.useDegrees = checked;
                                        }}
                                    />
                                    <SwitchPropertyLine
                                        label="Ignore Backfaces for Picking"
                                        description="Ignore backfaces when picking."
                                        value={settings.ignoreBackfacesForPicking}
                                        onChange={(checked) => {
                                            settings.ignoreBackfacesForPicking = checked;
                                        }}
                                    />
                                    <SwitchPropertyLine
                                        label="Show Properties on Selection"
                                        description="Shows the Properties pane when an entity is selected."
                                        value={settings.showPropertiesOnEntitySelection}
                                        onChange={(checked) => {
                                            settings.showPropertiesOnEntitySelection = checked;
                                        }}
                                    />
                                    <SwitchPropertyLine
                                        label="Compact Mode"
                                        description="Use a more compact UI with less spacing."
                                        value={settings.isCompactMode}
                                        onChange={(checked) => {
                                            settings.isCompactMode = checked;
                                        }}
                                    />
                                </AccordionSection>
                            </ExtensibleAccordion>
                        )}
                    </>
                );
            },
        });

        settings.dispose = () => {
            sidePaneRegistration.dispose();
            sizeModeContextRegistration.dispose();
        };

        return settings;
    },
};
