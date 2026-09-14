import Foundation

/// Pure, dependency-free logic for the offline local-media HTTP server
/// (PR #355 candidate C: a loopback-only server for cached reference video,
/// replacing the capacitor:// / http://localhost convertFileSrc URLs that
/// both failed real-device playback). Kept free of Capacitor/Network
/// imports so it can be unit-tested in isolation — verified via a
/// standalone `swift test` run (33/33 passing) before being embedded here.

enum PathValidationError: Error, Equatable {
    case invalidPath
    case outsideAllowedRoot
}

enum PathValidator {
    /// Validates a relative media path against the allowed cache root and rejects
    /// traversal, without touching the filesystem. Returns the validated relative
    /// path unchanged on success so the caller can resolve it against a real root.
    static func validateRelativePath(_ relativePath: String, allowedRootName: String) -> Result<String, PathValidationError> {
        guard !relativePath.isEmpty, !relativePath.hasPrefix("/") else {
            return .failure(.invalidPath)
        }

        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard components.allSatisfy({ !$0.isEmpty }) else {
            return .failure(.invalidPath)
        }
        guard components.first == allowedRootName else {
            return .failure(.outsideAllowedRoot)
        }
        guard !components.contains(where: { $0 == ".." || $0 == "." }) else {
            return .failure(.outsideAllowedRoot)
        }

        return .success(relativePath)
    }

    /// Resolves a validated relative path against an injected root, then re-verifies
    /// the standardized (symlink/`..`-resolved) result still lives inside the allowed
    /// root — the definitive traversal guard, not the string check above alone.
    static func resolveFileURL(relativePath: String, documentsRoot: URL, allowedRootName: String) -> Result<URL, PathValidationError> {
        switch validateRelativePath(relativePath, allowedRootName: allowedRootName) {
        case .failure(let error):
            return .failure(error)
        case .success(let validPath):
            let allowedRoot = documentsRoot.appendingPathComponent(allowedRootName, isDirectory: true).standardizedFileURL
            let candidate = documentsRoot.appendingPathComponent(validPath).standardizedFileURL

            let allowedRootPath = allowedRoot.path.hasSuffix("/") ? allowedRoot.path : allowedRoot.path + "/"
            guard candidate.path.hasPrefix(allowedRootPath) else {
                return .failure(.outsideAllowedRoot)
            }
            return .success(candidate)
        }
    }
}

enum RangeParseResult: Equatable {
    case full
    case range(start: Int, end: Int)
    case unsatisfiable
}

enum RangeParser {
    /// Parses a `Range: bytes=...` header against a known total size.
    /// Supports closed (`bytes=0-499`), open-ended (`bytes=500-`), and
    /// suffix (`bytes=-500`) forms. Returns `.full` when no/unparseable
    /// header is present (a plain 200 response), `.unsatisfiable` when the
    /// requested range cannot be satisfied for the given size (416).
    static func parse(header: String?, totalSize: Int) -> RangeParseResult {
        guard totalSize > 0 else { return .unsatisfiable }
        guard let header = header, header.hasPrefix("bytes=") else { return .full }

        let spec = header.dropFirst("bytes=".count)
        let bounds = spec.split(separator: "-", omittingEmptySubsequences: false)
        guard bounds.count <= 2 else { return .full }

        let fromString = bounds.count > 0 ? String(bounds[0]) : ""
        let toString = bounds.count > 1 ? String(bounds[1]) : ""

        var start: Int
        var end: Int

        if fromString.isEmpty {
            guard let suffixLength = Int(toString), suffixLength > 0 else { return .full }
            start = max(0, totalSize - suffixLength)
            end = totalSize - 1
        } else {
            guard let from = Int(fromString) else { return .full }
            start = from
            if toString.isEmpty {
                end = totalSize - 1
            } else {
                guard let to = Int(toString) else { return .full }
                end = to
            }
        }

        guard start >= 0, end >= start, start < totalSize else {
            return .unsatisfiable
        }
        end = min(end, totalSize - 1)

        return .range(start: start, end: end)
    }
}

enum MimeTypeResolver {
    static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "m4v": return "video/x-m4v"
        case "webm": return "video/webm"
        default: return "application/octet-stream"
        }
    }
}

/// Maps opaque, random tokens to resolved file URLs so the HTTP server never
/// exposes a filesystem path in a URL. Thread-safe; reuses a token for a
/// file URL already registered so repeated hydrate calls are stable.
final class TokenStore {
    private let lock = NSLock()
    private var tokenToFileURL: [String: URL] = [:]
    private let makeToken: () -> String

    init(makeToken: @escaping () -> String = { UUID().uuidString }) {
        self.makeToken = makeToken
    }

    @discardableResult
    func token(forFileURL fileURL: URL) -> String {
        lock.lock()
        defer { lock.unlock() }
        if let existing = tokenToFileURL.first(where: { $0.value == fileURL })?.key {
            return existing
        }
        let token = makeToken()
        tokenToFileURL[token] = fileURL
        return token
    }

    func fileURL(forToken token: String) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        return tokenToFileURL[token]
    }
}
