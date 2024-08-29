// eslint-disable-next-line import/no-internal-modules
import type { ISceneLoaderPluginExtensions } from "core/index";

/**
 * @internal
 */
export abstract class GLTFFileLoaderMetadata {
    /**
     * @internal
     */
    public static readonly MagicBase64Encoded = "Z2xURg"; // "glTF" base64 encoded (without the quotes!)

    /**
     * @internal
     */
    public static readonly Name = "gltf";

    /**
     * @internal
     */
    public static readonly Extensions = Object.freeze({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ".gltf": Object.freeze({ isBinary: false }),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ".glb": Object.freeze({ isBinary: true }),
    }) satisfies ISceneLoaderPluginExtensions;

    /**
     * @internal
     */
    public static CanDirectLoad(data: string): boolean {
        return (
            (data.indexOf("asset") !== -1 && data.indexOf("version") !== -1) ||
            data.startsWith("data:base64," + GLTFFileLoaderMetadata.MagicBase64Encoded) || // this is technically incorrect, but will continue to support for backcompat.
            data.startsWith("data:;base64," + GLTFFileLoaderMetadata.MagicBase64Encoded) ||
            data.startsWith("data:application/octet-stream;base64," + GLTFFileLoaderMetadata.MagicBase64Encoded) ||
            data.startsWith("data:model/gltf-binary;base64," + GLTFFileLoaderMetadata.MagicBase64Encoded)
        );
    }
}
