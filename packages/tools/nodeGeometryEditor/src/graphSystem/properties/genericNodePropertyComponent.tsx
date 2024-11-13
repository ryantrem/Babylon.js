import * as React from "react";
import { LineContainerComponent } from "shared-ui-components/lines/lineContainerComponent";
import { CheckBoxLineComponent } from "../../sharedComponents/checkBoxLineComponent";
import type { IPropertyComponentProps } from "shared-ui-components/nodeGraphSystem/interfaces/propertyComponentProps";
import { TextInputLineComponent } from "shared-ui-components/lines/textInputLineComponent";
import { Vector2LineComponent } from "shared-ui-components/lines/vector2LineComponent";
import { OptionsLine } from "shared-ui-components/lines/optionsLineComponent";
import { TextLineComponent } from "shared-ui-components/lines/textLineComponent";
import { FloatLineComponent } from "shared-ui-components/lines/floatLineComponent";
import { SliderLineComponent } from "shared-ui-components/lines/sliderLineComponent";
import type { NodeGeometryBlock } from "core/Meshes/Node/nodeGeometryBlock";
import type { NodeGeometryConnectionPoint } from "core/Meshes/Node/nodeGeometryBlockConnectionPoint";
import { NodeGeometryBlockConnectionPointTypes } from "core/Meshes/Node/Enums/nodeGeometryConnectionPointTypes";
import { Vector3LineComponent } from "shared-ui-components/lines/vector3LineComponent";
import { Vector4LineComponent } from "shared-ui-components/lines/vector4LineComponent";
import type { IEditablePropertyListOption } from "core/Decorators/nodeDecorator";
import { PropertyTypeForEdition, type IPropertyDescriptionForEdition } from "core/Decorators/nodeDecorator";
import { ForceRebuild } from "shared-ui-components/nodeGraphSystem/automaticProperties";

export class GenericPropertyComponent extends React.Component<IPropertyComponentProps> {
    constructor(props: IPropertyComponentProps) {
        super(props);
    }

    override render() {
        return (
            <>
                <GeneralPropertyTabComponent stateManager={this.props.stateManager} nodeData={this.props.nodeData} />
                <GenericPropertyTabComponent stateManager={this.props.stateManager} nodeData={this.props.nodeData} />
            </>
        );
    }
}

export class GeneralPropertyTabComponent extends React.Component<IPropertyComponentProps> {
    constructor(props: IPropertyComponentProps) {
        super(props);
    }

    processUpdate() {
        this.props.stateManager.onRebuildRequiredObservable.notifyObservers();
    }

    renderConnectionPoint(point: NodeGeometryConnectionPoint) {
        switch (point.type) {
            case NodeGeometryBlockConnectionPointTypes.Int: {
                if (point.valueMax !== undefined && point.valueMin !== undefined) {
                    return (
                        <SliderLineComponent
                            lockObject={this.props.stateManager.lockObject}
                            key={point.name}
                            label={point.name}
                            target={point}
                            propertyName="value"
                            decimalCount={0}
                            step={1}
                            minimum={point.valueMin}
                            maximum={point.valueMax}
                            onChange={() => this.processUpdate()}
                        />
                    );
                }
                return (
                    <FloatLineComponent
                        lockObject={this.props.stateManager.lockObject}
                        key={point.name}
                        label={point.name}
                        isInteger={true}
                        step="1"
                        digits={0}
                        target={point}
                        propertyName="value"
                        onChange={() => this.processUpdate()}
                    />
                );
            }
            case NodeGeometryBlockConnectionPointTypes.Float: {
                if (point.valueMax !== undefined && point.valueMin !== undefined) {
                    return (
                        <SliderLineComponent
                            lockObject={this.props.stateManager.lockObject}
                            key={point.name}
                            label={point.name}
                            target={point}
                            propertyName="value"
                            decimalCount={2}
                            step={(point.valueMax - point.valueMin) / 100.0}
                            minimum={point.valueMin}
                            maximum={point.valueMax}
                            onChange={() => this.processUpdate()}
                        />
                    );
                }
                return (
                    <FloatLineComponent
                        lockObject={this.props.stateManager.lockObject}
                        key={point.name}
                        label={point.name}
                        target={point}
                        propertyName="value"
                        onChange={() => this.processUpdate()}
                    />
                );
            }
            case NodeGeometryBlockConnectionPointTypes.Vector2:
                return (
                    <Vector2LineComponent
                        lockObject={this.props.stateManager.lockObject}
                        key={point.name}
                        label={point.name}
                        target={point}
                        propertyName="value"
                        onChange={() => this.processUpdate()}
                    />
                );
            case NodeGeometryBlockConnectionPointTypes.Vector3:
                return (
                    <Vector3LineComponent
                        lockObject={this.props.stateManager.lockObject}
                        key={point.name}
                        label={point.name}
                        target={point}
                        propertyName="value"
                        onChange={() => this.processUpdate()}
                    />
                );
            case NodeGeometryBlockConnectionPointTypes.Vector4:
                return (
                    <Vector4LineComponent
                        lockObject={this.props.stateManager.lockObject}
                        key={point.name}
                        label={point.name}
                        target={point}
                        propertyName="value"
                        onChange={() => this.processUpdate()}
                    />
                );
        }
        return null;
    }

    override render() {
        const block = this.props.nodeData.data as NodeGeometryBlock;

        const nonConnectedInputs = block.inputs.filter((input) => {
            return !input.isConnected && input.value !== null && input.value !== undefined;
        });

        return (
            <>
                <LineContainerComponent title="GENERAL">
                    <TextInputLineComponent
                        label="Name"
                        propertyName="name"
                        target={block}
                        lockObject={this.props.stateManager.lockObject}
                        onChange={() => this.props.stateManager.onUpdateRequiredObservable.notifyObservers(block)}
                        throttlePropertyChangedNotification={true}
                        validator={() => {
                            return true;
                        }}
                    />
                    <TextLineComponent label="Type" value={block.getClassName()} />
                    <TextInputLineComponent
                        label="Comments"
                        propertyName="comments"
                        lockObject={this.props.stateManager.lockObject}
                        target={block}
                        onChange={() => this.props.stateManager.onUpdateRequiredObservable.notifyObservers(block)}
                        throttlePropertyChangedNotification={true}
                    />
                    {<TextLineComponent label="Build execution time" value={`${block.buildExecutionTime.toFixed(2)} ms`} />}
                </LineContainerComponent>
                {nonConnectedInputs.length > 0 && (
                    <LineContainerComponent title="PROPERTIES">
                        {nonConnectedInputs.map((input) => {
                            return this.renderConnectionPoint(input);
                        })}
                    </LineContainerComponent>
                )}
                <LineContainerComponent title="DEBUG INFOS">
                    {block.outputs.map((output) => {
                        return (
                            <>
                                <TextLineComponent label={(output.displayName || output.name) + ":"} ignoreValue={true} additionalClass="bold" />
                                <TextLineComponent label="> Call count" value={output.callCount.toString()} />
                                <TextLineComponent label="> Execution count" value={output.executionCount.toString()} />
                            </>
                        );
                    })}
                </LineContainerComponent>
            </>
        );
    }
}

export class GenericPropertyTabComponent extends React.Component<IPropertyComponentProps> {
    constructor(props: IPropertyComponentProps) {
        super(props);
    }

    override render() {
        const block = this.props.nodeData.data as NodeGeometryBlock,
            propStore: IPropertyDescriptionForEdition[] = (block as any)._propStore;

        if (!propStore) {
            return <></>;
        }

        const componentList: { [groupName: string]: JSX.Element[] } = {},
            groups: string[] = [];

        const classes: string[] = [];

        let proto = Object.getPrototypeOf(block);
        while (proto) {
            classes.push(proto.constructor.name);
            proto = Object.getPrototypeOf(proto);
        }

        for (const { propertyName, displayName, type, groupName, options, className } of propStore) {
            let components = componentList[groupName];

            if (options.embedded || classes.indexOf(className) === -1) {
                continue;
            }

            if (!components) {
                components = [];
                componentList[groupName] = components;
                groups.push(groupName);
            }

            switch (type) {
                case PropertyTypeForEdition.Boolean: {
                    components.push(
                        <CheckBoxLineComponent
                            key={`checkBox-${propertyName}`}
                            label={displayName}
                            target={block}
                            propertyName={propertyName}
                            onValueChanged={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                        />
                    );
                    break;
                }
                case PropertyTypeForEdition.Float: {
                    const cantDisplaySlider = isNaN(options.min as number) || isNaN(options.max as number) || options.min === options.max;
                    if (cantDisplaySlider) {
                        components.push(
                            <FloatLineComponent
                                key={`float-${propertyName}`}
                                lockObject={this.props.stateManager.lockObject}
                                label={displayName}
                                propertyName={propertyName}
                                target={block}
                                onChange={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                            />
                        );
                    } else {
                        components.push(
                            <SliderLineComponent
                                key={`slider-${propertyName}`}
                                lockObject={this.props.stateManager.lockObject}
                                label={displayName}
                                target={block}
                                propertyName={propertyName}
                                step={Math.abs((options.max as number) - (options.min as number)) / 100.0}
                                minimum={Math.min(options.min as number, options.max as number)}
                                maximum={options.max as number}
                                onChange={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                            />
                        );
                    }
                    break;
                }
                case PropertyTypeForEdition.Int: {
                    const cantDisplaySlider = isNaN(options.min as number) || isNaN(options.max as number) || options.min === options.max;
                    if (cantDisplaySlider) {
                        components.push(
                            <FloatLineComponent
                                key={`int-${propertyName}`}
                                lockObject={this.props.stateManager.lockObject}
                                digits={0}
                                step={"1"}
                                isInteger={true}
                                label={displayName}
                                propertyName={propertyName}
                                target={block}
                                onChange={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                            />
                        );
                    } else {
                        components.push(
                            <SliderLineComponent
                                key={`slider-${propertyName}`}
                                lockObject={this.props.stateManager.lockObject}
                                label={displayName}
                                target={block}
                                step={1}
                                decimalCount={0}
                                propertyName={propertyName}
                                minimum={Math.min(options.min as number, options.max as number)}
                                maximum={options.max as number}
                                onChange={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                            />
                        );
                    }
                    break;
                }
                case PropertyTypeForEdition.Vector2: {
                    components.push(
                        <Vector2LineComponent
                            key={`vector2-${propertyName}`}
                            lockObject={this.props.stateManager.lockObject}
                            label={displayName}
                            propertyName={propertyName}
                            target={block}
                            onChange={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                        />
                    );
                    break;
                }
                case PropertyTypeForEdition.List: {
                    components.push(
                        <OptionsLine
                            key={`options-${propertyName}`}
                            label={displayName}
                            options={options.options as IEditablePropertyListOption[]}
                            target={block}
                            propertyName={propertyName}
                            onSelect={() => ForceRebuild(block, this.props.stateManager, propertyName, options.notifiers)}
                        />
                    );
                    break;
                }
            }
        }

        return (
            <>
                {groups.map((group) => (
                    <LineContainerComponent key={`group-${group}`} title={group}>
                        {componentList[group]}
                    </LineContainerComponent>
                ))}
            </>
        );
    }
}
