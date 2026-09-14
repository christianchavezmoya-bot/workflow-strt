import Foundation
import Network
import Capacitor

/// Capacitor bridge for the offline local-media server. JS calls
/// `LocalMediaServer.getUrl({ path })` with a cached reference-video's
/// relative localPath (e.g. "offline-config-media/{configId}/{mediaId}.mp4")
/// and receives back a `http://127.0.0.1:<port>/media/<token>` URL that
/// <video> can load, seek, and survive app restart against — see
/// LocalMediaHTTPServer for the loopback-only server itself, and
/// LocalMediaServerCore.swift for the unit-tested path/range/token logic.
@objc(LocalMediaServerPlugin)
public class LocalMediaServerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalMediaServerPlugin"
    public let jsName = "LocalMediaServer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getUrl", returnType: CAPPluginReturnPromise)
    ]

    @objc func getUrl(_ call: CAPPluginCall) {
        guard let relativePath = call.getString("path"), !relativePath.isEmpty else {
            call.reject("Missing required 'path' parameter")
            return
        }

        do {
            let urlString = try LocalMediaHTTPServer.shared.registerAndGetUrl(forRelativePath: relativePath)
            call.resolve(["url": urlString])
        } catch let error as LocalMediaServerError {
            call.reject(error.message)
        } catch {
            call.reject("Failed to prepare local media URL: \(error.localizedDescription)")
        }
    }
}

enum LocalMediaServerError: Error {
    case invalidPath
    case outsideAllowedRoot
    case fileNotFound
    case serverStartFailed(String)

    var message: String {
        switch self {
        case .invalidPath: return "Invalid media path"
        case .outsideAllowedRoot: return "Path is outside the allowed cache root"
        case .fileNotFound: return "Cached media file not found"
        case .serverStartFailed(let reason): return "Local media server failed to start: \(reason)"
        }
    }
}

/// A minimal HTTP/1.1 GET server (Network.framework, no third-party
/// dependency) bound ONLY to 127.0.0.1 on an OS-assigned ephemeral port —
/// never 0.0.0.0, never a fixed/predictable port. Streams cached video files
/// in 64KB chunks (never a full in-memory read, never base64) and serves
/// genuine Range/206/416 semantics so AVFoundation's real network stack
/// (which does NOT consult WKWebView's registered capacitor:// / http://
/// scheme handlers for <video> — see the PR #355 root-cause investigation)
/// can actually connect to and stream from something real.
final class LocalMediaHTTPServer {
    static let shared = LocalMediaHTTPServer()

    private static let allowedRootName = "offline-config-media"
    private static let chunkSize = 64 * 1024

    private let queue = DispatchQueue(label: "com.strata.ngo.localmediaserver")
    private let startLock = NSLock()
    private var listener: NWListener?
    private var port: UInt16?
    private let tokens = TokenStore()

    private init() {}

    func registerAndGetUrl(forRelativePath relativePath: String) throws -> String {
        guard let documentsRoot = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw LocalMediaServerError.invalidPath
        }

        let fileURL: URL
        switch PathValidator.resolveFileURL(relativePath: relativePath, documentsRoot: documentsRoot, allowedRootName: Self.allowedRootName) {
        case .failure(.invalidPath):
            throw LocalMediaServerError.invalidPath
        case .failure(.outsideAllowedRoot):
            throw LocalMediaServerError.outsideAllowedRoot
        case .success(let resolved):
            fileURL = resolved
        }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
            throw LocalMediaServerError.fileNotFound
        }

        try startIfNeeded()

        guard let port = self.port else {
            throw LocalMediaServerError.serverStartFailed("no port bound")
        }

        let token = tokens.token(forFileURL: fileURL)
        return "http://127.0.0.1:\(port)/media/\(token)"
    }

    // MARK: - Lifecycle

    private func startIfNeeded() throws {
        startLock.lock()
        defer { startLock.unlock() }
        if listener != nil, port != nil { return }

        let parameters = NWParameters.tcp
        // Loopback-only: the local endpoint is pinned to 127.0.0.1 with an
        // OS-assigned ephemeral port. This is the documented Network.framework
        // pattern for restricting a listener away from all interfaces (0.0.0.0)
        // to just the loopback address — never LAN-reachable.
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: NWEndpoint.Host("127.0.0.1"), port: .any)
        parameters.allowLocalEndpointReuse = true

        let newListener: NWListener
        do {
            newListener = try NWListener(using: parameters)
        } catch {
            throw LocalMediaServerError.serverStartFailed(error.localizedDescription)
        }

        let semaphore = DispatchSemaphore(value: 0)
        var startError: Error?

        newListener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                semaphore.signal()
            case .failed(let error):
                startError = error
                semaphore.signal()
            default:
                break
            }
        }
        newListener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection: connection)
        }
        newListener.start(queue: queue)

        _ = semaphore.wait(timeout: .now() + 5)
        if let startError = startError {
            throw LocalMediaServerError.serverStartFailed(startError.localizedDescription)
        }
        guard let boundPort = newListener.port?.rawValue else {
            newListener.cancel()
            throw LocalMediaServerError.serverStartFailed("listener did not report a bound port")
        }

        self.listener = newListener
        self.port = boundPort
    }

    // MARK: - Connection handling

    private func accept(connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(on: connection, buffer: Data())
    }

    private func receiveRequest(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            if error != nil {
                connection.cancel()
                return
            }
            var buffer = buffer
            if let data = data, !data.isEmpty {
                buffer.append(data)
            }
            if let headerEndRange = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let headerData = buffer.subdata(in: buffer.startIndex..<headerEndRange.lowerBound)
                self.handleRequest(headerData: headerData, connection: connection)
                return
            }
            if isComplete || buffer.count > 16384 {
                connection.cancel()
                return
            }
            self.receiveRequest(on: connection, buffer: buffer)
        }
    }

    private func handleRequest(headerData: Data, connection: NWConnection) {
        guard let headerText = String(data: headerData, encoding: .utf8) else {
            respondSimple(connection: connection, status: 400, statusText: "Bad Request")
            return
        }
        let lines = headerText.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            respondSimple(connection: connection, status: 400, statusText: "Bad Request")
            return
        }
        let requestParts = requestLine.split(separator: " ")
        guard requestParts.count >= 2 else {
            respondSimple(connection: connection, status: 400, statusText: "Bad Request")
            return
        }
        guard requestParts[0] == "GET" else {
            respondSimple(connection: connection, status: 405, statusText: "Method Not Allowed", extraHeaders: ["Allow": "GET"])
            return
        }
        let path = String(requestParts[1])

        var rangeHeader: String?
        for line in lines.dropFirst() {
            guard let colonIndex = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colonIndex].trimmingCharacters(in: .whitespaces).lowercased()
            if key == "range" {
                rangeHeader = line[line.index(after: colonIndex)...].trimmingCharacters(in: .whitespaces)
            }
        }

        guard path.hasPrefix("/media/") else {
            respondSimple(connection: connection, status: 404, statusText: "Not Found")
            return
        }
        let token = String(path.dropFirst("/media/".count))

        guard let fileURL = tokens.fileURL(forToken: token), FileManager.default.fileExists(atPath: fileURL.path) else {
            respondSimple(connection: connection, status: 404, statusText: "Not Found")
            return
        }

        serveFile(fileURL, rangeHeader: rangeHeader, connection: connection)
    }

    private func serveFile(_ fileURL: URL, rangeHeader: String?, connection: NWConnection) {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
              let totalSize = (attributes[.size] as? NSNumber)?.intValue, totalSize > 0 else {
            respondSimple(connection: connection, status: 404, statusText: "Not Found")
            return
        }

        let rangeResult = RangeParser.parse(header: rangeHeader, totalSize: totalSize)

        if case .unsatisfiable = rangeResult {
            respondSimple(connection: connection, status: 416, statusText: "Range Not Satisfiable", extraHeaders: ["Content-Range": "bytes */\(totalSize)"])
            return
        }

        let start: Int
        let end: Int
        let isPartial: Bool
        switch rangeResult {
        case .range(let s, let e):
            start = s; end = e; isPartial = true
        case .full:
            start = 0; end = totalSize - 1; isPartial = false
        case .unsatisfiable:
            return // handled above
        }

        guard let fileHandle = try? FileHandle(forReadingFrom: fileURL) else {
            respondSimple(connection: connection, status: 500, statusText: "Internal Server Error")
            return
        }

        let mimeType = MimeTypeResolver.mimeType(forExtension: fileURL.pathExtension)
        let contentLength = end - start + 1
        var headers: [String: String] = [
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes",
            "Content-Length": String(contentLength),
            "Cache-Control": "no-cache",
            "Connection": "close",
        ]

        let status: Int
        let statusText: String
        if isPartial {
            status = 206
            statusText = "Partial Content"
            headers["Content-Range"] = "bytes \(start)-\(end)/\(totalSize)"
        } else {
            status = 200
            statusText = "OK"
        }

        sendStatusAndHeaders(connection: connection, status: status, statusText: statusText, headers: headers) { [weak self] in
            self?.streamFile(fileHandle: fileHandle, start: start, remaining: contentLength, connection: connection)
        }
    }

    private func streamFile(fileHandle: FileHandle, start: Int, remaining: Int, connection: NWConnection) {
        do {
            try fileHandle.seek(toOffset: UInt64(start))
        } catch {
            fileHandle.closeFile()
            connection.cancel()
            return
        }
        streamChunk(fileHandle: fileHandle, remaining: remaining, connection: connection)
    }

    private func streamChunk(fileHandle: FileHandle, remaining: Int, connection: NWConnection) {
        guard remaining > 0 else {
            fileHandle.closeFile()
            connection.send(content: nil, completion: .contentProcessed { _ in connection.cancel() })
            return
        }
        let readSize = min(Self.chunkSize, remaining)
        let data = fileHandle.readData(ofLength: readSize)
        guard !data.isEmpty else {
            fileHandle.closeFile()
            connection.cancel()
            return
        }
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            guard let self = self, error == nil else {
                fileHandle.closeFile()
                connection.cancel()
                return
            }
            self.streamChunk(fileHandle: fileHandle, remaining: remaining - data.count, connection: connection)
        })
    }

    // MARK: - Response helpers

    private func sendStatusAndHeaders(connection: NWConnection, status: Int, statusText: String, headers: [String: String], completion: @escaping () -> Void) {
        var response = "HTTP/1.1 \(status) \(statusText)\r\n"
        for (key, value) in headers {
            response += "\(key): \(value)\r\n"
        }
        response += "\r\n"
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { error in
            guard error == nil else {
                connection.cancel()
                return
            }
            completion()
        })
    }

    private func respondSimple(connection: NWConnection, status: Int, statusText: String, extraHeaders: [String: String] = [:]) {
        var headers = extraHeaders
        headers["Content-Length"] = "0"
        headers["Connection"] = "close"
        var response = "HTTP/1.1 \(status) \(statusText)\r\n"
        for (key, value) in headers {
            response += "\(key): \(value)\r\n"
        }
        response += "\r\n"
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
