import type { FluentProviderProps } from "@fluentui/react-components";
import type { FunctionComponent } from "react";

import { createCSSStyleSheetFromTheme, ThemelessFluentProvider } from "@fluentui-contrib/react-themeless-provider";
import { FluentProvider, PortalMountNodeProvider, RendererProvider } from "@fluentui/react-components";
import { createShadowDOMRenderer } from "@griffel/shadow-dom";
import { useEffect, useLayoutEffect, useState } from "react";
import { useThemeMode } from "../hooks/themeHooks";
import { DarkTheme, LightTheme } from "../themes/babylonTheme";

type ThemeProps = Omit<FluentProviderProps, "applyStylesToPortals" | "theme">;

export const Theme: FunctionComponent<ThemeProps & { invert?: boolean }> = (props) => {
    const { invert = false, ...rest } = props;
    const [sentinelElement, setSentinelElement] = useState<HTMLDivElement | null>(null);
    const [fluentRootComponent, setFluentRootComponent] = useState<FunctionComponent<ThemeProps>>();

    useLayoutEffect(() => {
        if (sentinelElement) {
            const containerRootNode = sentinelElement.getRootNode();
            if (containerRootNode instanceof ShadowRoot) {
                const renderer = createShadowDOMRenderer(containerRootNode, { insertionPoint: undefined });

                const fluentRootComponent: FunctionComponent<ThemeProps> = (props) => {
                    const { isDarkMode } = useThemeMode();

                    useEffect(() => {
                        // Use :host instead of :root - :root doesn't work inside ShadowRoot
                        const themeSheet = createCSSStyleSheetFromTheme(":host", isDarkMode !== invert ? DarkTheme : LightTheme);
                        // Add to ShadowRoot's adoptedStyleSheets, not document's
                        containerRootNode.adoptedStyleSheets = [...containerRootNode.adoptedStyleSheets, themeSheet];
                        return () => {
                            // Remove only this specific stylesheet on cleanup
                            containerRootNode.adoptedStyleSheets = containerRootNode.adoptedStyleSheets.filter((sheet) => sheet !== themeSheet);
                        };
                    }, [isDarkMode]);

                    return (
                        <RendererProvider renderer={renderer}>
                            <PortalMountNodeProvider value={containerRootNode}>
                                <ThemelessFluentProvider {...props} />
                            </PortalMountNodeProvider>
                        </RendererProvider>
                    );
                };
                fluentRootComponent.displayName = "ShadowDOMFluentRootProvider";
                setFluentRootComponent(() => fluentRootComponent);
            } else {
                const fluentRootComponent: FunctionComponent<ThemeProps> = (props) => {
                    const { isDarkMode } = useThemeMode();
                    return <FluentProvider theme={isDarkMode !== invert ? DarkTheme : LightTheme} {...props} />;
                };
                fluentRootComponent.displayName = "DocumentFluentRootProvider";
                setFluentRootComponent(() => fluentRootComponent);
            }
        } else {
            setFluentRootComponent(undefined);
        }
    }, [sentinelElement, invert]);

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const FluentRootComponent = fluentRootComponent;

    return (
        <>
            {FluentRootComponent && <FluentRootComponent key="FluentRootComponent" {...rest} />}
            <div key="SentinelElement" ref={setSentinelElement} hidden />
        </>
    );
};
