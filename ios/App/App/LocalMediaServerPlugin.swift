import Foundation
import Capacitor

@objc(LocalMediaServerPlugin)
public class LocalMediaServerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalMediaServerPlugin"
    public let jsName = "LocalMediaServer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPlaybackUrl", returnType: CAPPluginReturnPromise),
    ]

    @objc func getPlaybackUrl(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), !uri.isEmpty else {
            call.reject("uri is required")
            return
        }

        let mimeType = call.getString("mimeType") ?? "video/mp4"
        guard let fileURL = URL(string: uri) else {
            call.reject("Invalid file uri")
            return
        }

        do {
            let playbackUrl = try LocalMediaHttpServer.shared.register(fileURL: fileURL, mimeType: mimeType)
            call.resolve(["url": playbackUrl])
        } catch {
            call.reject("Failed to start local media server", nil, error)
        }
    }
}
