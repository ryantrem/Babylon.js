import { type IService } from "../modularity/serviceDefinition";
import { type ToastOptions } from "shared-ui-components/fluent/primitives/toast";

/**
 * The unique identity symbol for the toast service.
 */
export const ToastServiceIdentity = Symbol("ToastService");

/**
 * A service that allows showing toast notifications from non-React code (e.g. other services).
 */
export interface IToastService extends IService<typeof ToastServiceIdentity> {
    /**
     * Shows a toast notification with the given message.
     * @param message The message to display in the toast.
     * @param options Optional toast configuration.
     */
    showToast(message: string, options?: ToastOptions): void;
}
