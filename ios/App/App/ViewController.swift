import Capacitor

/// Registers the local, hand-written LocalMediaServerPlugin (not an npm/SPM
/// package, so it isn't picked up by Capacitor's packageClassList auto-
/// registration) — the documented Capacitor pattern for local iOS plugins.
/// Main.storyboard's root view controller customClass="ViewController" now
/// also declares customModule="App" customModuleProvider="target" (the
/// isolation test proved the storyboard entry lacking a module hint was the
/// boot regression — PRODUCT_MODULE_NAME is verified "App" via
/// `xcodebuild -showBuildSettings`, not assumed).
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LocalMediaServerPlugin())
    }
}
