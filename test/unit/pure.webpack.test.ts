import * as fs from "fs";
import * as path from "path";
import webpack, { type Configuration, type Stats } from "webpack";

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();

describe("No side effects - Webpack", () => {
    const outputDir = path.resolve(__dirname, "dist");

    afterAll(() => {
        // Clean up the output directory after the test.
        fs.rmSync(outputDir, { recursive: true, force: true });
    });

    it("programmatically generates the expected bundle output", async () => {
        const publicDirectory = path.resolve(__dirname, "../../packages/public");

        const config: Configuration = {
            entry: path.resolve(__dirname, "pure.js"),
            output: {
                path: outputDir,
                filename: "bundle.webpack.js",
                clean: true,
                chunkFormat: false,
            },
            mode: "production",
            devtool: false,
            optimization: {
                minimize: false,
            },
            resolve: {
                extensions: [".js"],
                alias: {
                    "@babylonjs/core": path.resolve(publicDirectory, "@babylonjs/core"),
                    "@babylonjs/loaders": path.resolve(publicDirectory, "@babylonjs/loaders"),
                    "@babylonjs/materials": path.resolve(publicDirectory, "@babylonjs/materials"),
                },
            },
        };

        await new Promise<Stats>((resolve, reject) => {
            webpack(config, (err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!stats) {
                    reject(new Error("No stats returned from webpack"));
                    return;
                }
                if (stats.hasErrors()) {
                    reject(new Error(stats.compilation.errors.map((e) => e.message).join("\n")));
                    return;
                }
                resolve(stats);
            });
        });

        const generatedCode = fs.readFileSync(path.join(outputDir, "bundle.webpack.js"), "utf8");

        const expectedCode = fs.readFileSync(path.resolve(__dirname, "pure.webpack.expected.js"), "utf8");

        expect(normalize(generatedCode)).toBe(normalize(expectedCode));
    }, 30000);
});
