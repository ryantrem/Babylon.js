import { UseDegreesStorageKey, IgnoreBackfacesForPickingStorageKey, ShowPropertiesOnEntitySelectionStorageKey } from "../services/settings";

import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";

function useSetting<T>(storageKey: string, defaultValue: T): [T, (value: T) => void, () => void] {
    const [value, setValue, resetValue] = useLocalStorage<T>(storageKey, defaultValue);

    if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify(value));
    }

    return [value, setValue, resetValue] as const;
}

/**
 * Gets the use degrees setting.
 * @returns A tuple containing the setting, a function to update it, and a function to reset it.
 */
export function useUseDegrees() {
    return useSetting<boolean>(UseDegreesStorageKey, false);
}

/**
 * Gets the ignore backfaces for picking setting.
 * @returns A tuple containing the setting, a function to update it, and a function to reset it.
 */
export function useIgnoreBackfacesForPicking() {
    return useSetting<boolean>(IgnoreBackfacesForPickingStorageKey, false);
}

/**
 * Gets the show properties on entity selection setting.
 * @returns A tuple containing the setting, a function to update it, and a function to reset it.
 */
export function useShowPropertiesOnEntitySelection() {
    return useSetting<boolean>(ShowPropertiesOnEntitySelectionStorageKey, true);
}

const RadiansToDegrees = 180 / Math.PI;

function WrapAngle(angle: number) {
    angle %= Math.PI * 2;
    if (angle < 0) {
        angle += Math.PI * 2;
    }
    return angle;
}

/**
 * Gets functions used to convert to/from display values for angles based on the current settings.
 * @returns A tuple containing the functions to convert to and from display values.
 */
export function useAngleConverters() {
    const [useDegrees] = useUseDegrees();

    const toDisplayValue = useCallback(
        (angle: number, wrap = false) => {
            if (wrap) {
                angle = WrapAngle(angle);
            }
            return useDegrees ? angle * RadiansToDegrees : angle;
        },
        [useDegrees]
    );

    const fromDisplayValue = useCallback(
        (angle: number, wrap = false) => {
            angle = useDegrees ? angle / RadiansToDegrees : angle;
            if (wrap) {
                angle = WrapAngle(angle);
            }
            return angle;
        },
        [useDegrees]
    );

    return [toDisplayValue, fromDisplayValue, useDegrees] as const;
}
