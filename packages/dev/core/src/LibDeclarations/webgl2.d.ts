/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/naming-convention */
// Type definitions for WebGL 2 extended with Babylon specific types

interface WebGL2RenderingContext extends WebGL2RenderingContextBase {
    HALF_FLOAT_OES: number;
    RGBA16F: typeof WebGL2RenderingContext.RGBA16F;
    RGBA32F: typeof WebGL2RenderingContext.RGBA32F;
    DEPTH24_STENCIL8: typeof WebGL2RenderingContext.DEPTH24_STENCIL8;
    COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: number;
    COMPRESSED_SRGB_S3TC_DXT1_EXT: number;
    COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT: number;
    COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: number;
    COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: number;
    COMPRESSED_SRGB8_ETC2: number;
    COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: number;
    DRAW_FRAMEBUFFER: typeof WebGL2RenderingContext.DRAW_FRAMEBUFFER;
    UNSIGNED_INT_24_8: typeof WebGL2RenderingContext.UNSIGNED_INT_24_8;
    MIN: typeof WebGL2RenderingContext.MIN;
    MAX: typeof WebGL2RenderingContext.MAX;
    R16_EXT: number;
    RG16_EXT: number;
    RGB16_EXT: number;
    RGBA16_EXT: number;
    R16_SNORM_EXT: number;
    RG16_SNORM_EXT: number;
    RGB16_SNORM_EXT: number;
    RGBA16_SNORM_EXT: number;

    // OES_draw_buffers_indexed extension methods
    blendEquationSeparateIndexed(buf: GLuint, modeRGB: GLenum, modeAlpha: GLenum): void;
    blendEquationIndexed(buf: GLuint, mode: GLenum): void;
    blendFuncSeparateIndexed(buf: GLuint, srcRGB: GLenum, dstRGB: GLenum, srcAlpha: GLenum, dstAlpha: GLenum): void;
    blendFuncIndexed(buf: GLuint, src: GLenum, dst: GLenum): void;
    colorMaskIndexed(buf: GLuint, r: GLboolean, g: GLboolean, b: GLboolean, a: GLboolean): void;
    disableIndexed(target: GLenum, index: GLuint): void;
    enableIndexed(target: GLenum, index: GLuint): void;
}

interface EXT_disjoint_timer_query {
    QUERY_COUNTER_BITS_EXT: number;
    TIME_ELAPSED_EXT: number;
    TIMESTAMP_EXT: number;
    GPU_DISJOINT_EXT: number;
    QUERY_RESULT_EXT: number;
    QUERY_RESULT_AVAILABLE_EXT: number;
    queryCounterEXT(query: WebGLQuery, target: number): void;
    createQueryEXT(): WebGLQuery;
    beginQueryEXT(target: number, query: WebGLQuery): void;
    endQueryEXT(target: number): void;
    getQueryObjectEXT(query: WebGLQuery, target: number): any;
    deleteQueryEXT(query: WebGLQuery): void;
}

interface WebGLProgram {
    __SPECTOR_rebuildProgram?:
        | ((vertexSourceCode: string, fragmentSourceCode: string, onCompiled: (program: WebGLProgram) => void, onError: (message: string) => void) => void)
        | null;
}

interface WebGLUniformLocation {
    _currentState: any;
}
