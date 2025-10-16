import { useMemo, type ComponentType, type FunctionComponent, type PropsWithChildren, type Provider } from "react";

import type { IDisposable, IReadonlyObservable } from "core/index";
import type { IService, ServiceDefinition } from "../modularity/serviceDefinition";

import { ObservableCollection } from "../misc/observableCollection";
import { useObservableCollection, useObservableState } from "../hooks/observableHooks";
import { Observable } from "core/Misc/observable";

export const ReactContextServiceIdentity = Symbol("ReactContextService");

export interface IProviderHandle extends IDisposable {
    updateValue(): void;
}

/**
 *
 */
export interface IReactContextService extends IService<typeof ReactContextServiceIdentity> {
    addProvider<T>(provider: Provider<T>, valueAccessor: () => T): IProviderHandle;
    readonly component: ComponentType<PropsWithChildren>;
}

export const ReactContextServiceDefinition: ServiceDefinition<[IReactContextService], []> = {
    friendlyName: "React Context Service",
    produces: [ReactContextServiceIdentity],
    consumes: [],
    factory: () => {
        const providerCollection = new ObservableCollection<[Provider<unknown>, () => unknown, IReadonlyObservable<void>]>();

        const wrapperComponent: FunctionComponent<PropsWithChildren> = (props) => {
            const providers = useObservableCollection(providerCollection);

            // eslint-disable-next-line @typescript-eslint/naming-convention
            const ProvidersComponent = useMemo(
                () =>
                    providers.reduce<FunctionComponent<PropsWithChildren>>(
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        (AccumulatedComponent, CurrentComponent) => (props) => {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            const [Provider, valueAccessor, valueChangedObservable] = CurrentComponent;
                            const value = useObservableState(valueAccessor, valueChangedObservable);

                            return (
                                <AccumulatedComponent>
                                    <Provider value={value}>{props.children}</Provider>
                                </AccumulatedComponent>
                            );
                        },
                        (props) => <>{props.children}</>
                    ),
                [providers]
            );

            return <ProvidersComponent>{props.children}</ProvidersComponent>;
        };

        return {
            addProvider: (provider, valueAccessor) => {
                const observable = new Observable<void>();
                const token = providerCollection.add([provider as Provider<unknown>, valueAccessor, observable]);
                return {
                    updateValue: () => observable.notifyObservers(),
                    dispose: () => token.dispose(),
                };
            },
            component: wrapperComponent,
        };
    },
};
