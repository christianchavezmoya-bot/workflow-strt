import Capacitor

/// Registers the local, hand-written iOS plugins (LocalMediaServerPlugin,
/// DeviceStoragePlugin) — not npm/SPM packages, so they aren't picked up by
/// Capacitor's packageClassList auto-registration — the documented Capacitor
/// pattern for local iOS plugins.
/// Main.storyboard's root view controller customClass="ViewController" now
/// also declares customModule="App" customModuleProvider="target" (the
/// isolation test proved the storyboard entry lacking a module hint was the
/// boot regression — PRODUCT_MODULE_NAME is verified "App" via
/// `xcodebuild -showBuildSettings`, not assumed).
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LocalMediaServerPlugin())
        bridge?.registerPluginInstance(DeviceStoragePlugin())
    }
}
