/**
 * capacitor-native-biometric v4.x ships only a CocoaPods podspec and has no
 * Package.swift, so Capacitor 8's SPM build silently omits it. This script
 * writes a minimal Package.swift shim into the plugin's node_modules folder
 * after every `npm install` so that `npx cap sync ios` picks it up correctly.
 */

const fs = require("fs");
const path = require("path");

const dest = path.join(
  __dirname,
  "..",
  "node_modules",
  "capacitor-native-biometric",
  "Package.swift"
);

const content = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorNativeBiometric",
    platforms: [.iOS(.v13)],
    products: [
        .library(
            name: "CapacitorNativeBiometric",
            targets: ["CapacitorNativeBiometricPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "CapacitorNativeBiometricPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin",
            sources: ["Plugin.swift"]
        )
    ]
)
`;

fs.writeFileSync(dest, content, "utf8");
console.log("[postinstall] Wrote Package.swift shim for capacitor-native-biometric");
