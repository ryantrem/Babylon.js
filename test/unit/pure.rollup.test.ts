import * as fs from "fs";
import * as path from "path";
import type { OutputAsset, OutputChunk, OutputOptions, RollupOptions } from "rollup";
import alias from "@rollup/plugin-alias";
import { rollup } from "rollup";

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();

describe("No side effects - Rollup", () => {
    it("programmatically generates the expected bundle output", async () => {
        const publicDirectory = path.resolve(__dirname, "../../packages/public");

        const config: RollupOptions & { output: OutputOptions } = {
            input: path.resolve(__dirname, "pure.js"),
            output: {
                dir: path.resolve(__dirname, "dist"),
                format: "es",
                exports: "named",
                inlineDynamicImports: true,
            },
            plugins: [
                alias({
                    entries: [
                        { find: "@babylonjs/core", replacement: path.resolve(publicDirectory, "@babylonjs/core") },
                        { find: "@babylonjs/loaders", replacement: path.resolve(publicDirectory, "@babylonjs/loaders") },
                        { find: "@babylonjs/materials", replacement: path.resolve(publicDirectory, "@babylonjs/materials") },
                    ],
                }),
            ],
            onwarn(warning) {
                throw new Error(warning.message);
            },
        };

        let bundle;
        try {
            const { output: outputOptions, ...inputOptions } = config;

            bundle = await rollup(inputOptions);
            const generated = await bundle.generate(outputOptions);

            const generatedCode = generated.output
                .map((outputFile: OutputAsset | OutputChunk) => {
                    if (outputFile.type === "asset") {
                        return typeof outputFile.source === "string" ? outputFile.source : outputFile.source.toString();
                    }

                    return outputFile.code;
                })
                .join("\n");

            const expectedCode = fs.readFileSync(path.resolve(__dirname, "pure.rollup.expected.js"), "utf8");

            expect(normalize(generatedCode)).toBe(normalize(expectedCode));
        } finally {
            if (bundle) {
                await bundle.close();
            }
        }
    }, 30000);
});
