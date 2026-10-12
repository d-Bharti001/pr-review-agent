const SKIPPED_PATH_PATTERNS: RegExp[] = [
    // lockfiles
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/,
    // vendored and build output
    /(^|\/)(node_modules|vendor)\//,
    /^(dist|build|coverage|\.next)\//,
    // minified, source maps
    /\.min\.(js|css)$/,
    /\.map$/,
    // protobuf and gRPC generated
    /\.pb(\.gw)?\.go$/, //          Go (also grpc-gateway)
    /_pb2(_grpc)?\.pyi?$/, //       Python
    /\.pb\.(cc|h)$/, //             C++
    /_(grpc_)?pb(\.d)?\.[jt]s$/, // JS and TS (grpc-tools, protoc-gen-js)
    /\.pb(objc)?\.(swift|[hm])$/, // Swift and Objective-C
    /\.g\.cs$/, //                  C#
    // other generated code
    /(^|\/)__generated__\//,
    /\.generated\./,
];

export function isSkippedFile(file: { path: string; status: string; patch?: string }): boolean {
    if (!file.patch) return true; // binary, too large, or a pure rename

    if (SKIPPED_PATH_PATTERNS.some((pattern) => pattern.test(file.path))) return true;

    return false;
}
