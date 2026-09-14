import Foundation
import Network

/// Serves cached media files over a real loopback HTTP socket so AVFoundation-backed
/// <video> elements can stream with Range/206 — WKURLSchemeHandler does not receive
/// those requests on iOS.
final class LocalMediaHttpServer {
    static let shared = LocalMediaHttpServer()

    private let queue = DispatchQueue(label: "LocalMediaHttpServer")
    private var listener: NWListener?
    private var port: UInt16 = 0
    private var routes: [String: (url: URL, mime: String)] = [:]
    private let routeLock = NSLock()

    private init() {}

    func register(fileURL: URL, mimeType: String) throws -> String {
        try ensureStarted()
        let token = UUID().uuidString
        routeLock.lock()
        routes[token] = (fileURL, mimeType)
        routeLock.unlock()
        return "http://127.0.0.1:\(port)/media/\(token)"
    }

    private func ensureStarted() throws {
        if listener != nil { return }

        let params = NWParameters.tcp
        params.acceptLocalOnly = true
        guard let bindPort = NWEndpoint.Port(rawValue: 0) else {
            throw NSError(domain: "LocalMediaHttpServer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid port"])
        }

        let listener = try NWListener(using: params, on: bindPort)
        self.listener = listener

        listener.stateUpdateHandler = { [weak self] state in
            if case .ready = state, let assigned = listener.port?.rawValue {
                self?.port = assigned
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection: connection)
        }
        listener.start(queue: queue)

        var attempts = 0
        while port == 0 && attempts < 100 {
            usleep(10_000)
            attempts += 1
        }
        if port == 0 {
            throw NSError(domain: "LocalMediaHttpServer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Loopback server did not bind"])
        }
    }

    private func handle(connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            self.respond(to: request, connection: connection)
        }
    }

    private func respond(to request: String, connection: NWConnection) {
        let lines = request.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else {
            connection.cancel()
            return
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" else {
            sendStatus(405, connection: connection)
            return
        }

        let path = String(parts[1])
        guard path.hasPrefix("/media/") else {
            sendStatus(404, connection: connection)
            return
        }

        let token = String(path.dropFirst("/media/".count))
        routeLock.lock()
        let route = routes[token]
        routeLock.unlock()
        guard let route else {
            sendStatus(404, connection: connection)
            return
        }

        var rangeHeader: String?
        for line in lines.dropFirst() {
            let lower = line.lowercased()
            if lower.hasPrefix("range:") {
                rangeHeader = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            }
        }

        let attrs = try? FileManager.default.attributesOfItem(atPath: route.url.path)
        let total = (attrs?[.size] as? NSNumber)?.intValue ?? 0
        guard total > 0, let handle = try? FileHandle(forReadingFrom: route.url) else {
            sendStatus(404, connection: connection)
            return
        }
        defer { try? handle.close() }

        var start = 0
        var end = total - 1
        var status = "200 OK"
        var extraHeaders = ""

        if let rangeHeader, rangeHeader.hasPrefix("bytes=") {
            let spec = String(rangeHeader.dropFirst("bytes=".count))
            let bounds = spec.split(separator: "-", maxSplits: 1).map(String.init)
            if let from = Int(bounds[0]) {
                start = max(0, from)
                if bounds.count > 1, !bounds[1].isEmpty, let to = Int(bounds[1]) {
                    end = min(total - 1, to)
                }
                status = "206 Partial Content"
                extraHeaders = "Content-Range: bytes \(start)-\(end)/\(total)\r\n"
            }
        }

        if start > end || start >= total {
            sendStatus(416, connection: connection)
            return
        }

        try? handle.seek(toOffset: UInt64(start))
        let chunk = handle.readData(ofLength: end - start + 1)
        let header = """
        HTTP/1.1 \(status)\r
        Content-Type: \(route.mime)\r
        Content-Length: \(chunk.count)\r
        Accept-Ranges: bytes\r
        Connection: close\r
        \(extraHeaders)\r
        """
        var response = Data(header.utf8)
        response.append(chunk)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func sendStatus(_ code: Int, connection: NWConnection) {
        let text: String
        switch code {
        case 404: text = "Not Found"
        case 405: text = "Method Not Allowed"
        case 416: text = "Range Not Satisfiable"
        default: text = "Error"
        }
        let body = Data("\(code) \(text)".utf8)
        let header = """
        HTTP/1.1 \(code) \(text)\r
        Content-Length: \(body.count)\r
        Connection: close\r
        \r
        """
        var response = Data(header.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
