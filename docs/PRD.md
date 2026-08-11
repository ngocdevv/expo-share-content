# Product requirements: expo-share-content

## 1. Problem

Expo applications need a reliable way to receive content from the native share sheet. Existing React Native packages commonly depend on the legacy bridge, manual AndroidManifest edits, and manually maintained iOS Share Extension targets. Event-only APIs also lose data when JavaScript is not ready during a cold start.

`expo-share-content` provides the same core capability using Expo Modules and an Expo config plugin.

## 2. Goals

1. Receive text, URLs, images, videos, audio, and generic files on Android and iOS.
2. Support cold-start and warm-start delivery.
3. Preserve all items from one share operation as one payload.
4. Prevent cold-start loss with a durable pending queue.
5. Support explicit per-payload acknowledgement.
6. Expose typed Promise and event APIs.
7. Configure native projects through an idempotent Expo config plugin.
8. Be safe to import on web.
9. Build and autolink with Expo SDK 57 conventions.

## 3. Non-goals

- Sending content out of the app.
- Running inside Expo Go.
- Uploading shared content in the background.
- Permanently managing attachment storage.
- Guaranteeing that iOS foregrounds the host app after a share.
- Supporting arbitrary custom native projects without reviewing prebuild changes.

## 4. Public contract

### 4.1 Payload

A `SharePayload` is one native share operation:

- `id`: stable UUID for deduplication and acknowledgement.
- `timestamp`: Unix time in milliseconds.
- `source`: `share-sheet`.
- `title`: optional source-provided title.
- `items`: one or more `SharedContentItem` values.

Each item has a stable ID and one normalized type:

- `text`
- `url`
- `image`
- `video`
- `audio`
- `file`

Textual items expose `text`. Binary items expose an app-owned managed `file://` URI plus optional MIME type, filename, and byte size. Pending files are protected; released files are retained for up to seven days from receipt.

### 4.2 Delivery semantics

Delivery is at least once.

- `getPendingSharesAsync` peeks all queue records.
- `getInitialShareAsync` peeks the oldest record.
- `clearPendingSharesAsync(ids)` acknowledges selected records.
- `clearPendingSharesAsync()` clears every record.
- `onShareReceived` provides low-latency warm-start delivery.
- `onShareError` reports native failures.

The event and pending APIs may surface the same stable ID. Consumers must make business processing idempotent and acknowledge only after successful processing.

## 5. Native architecture

### 5.1 Android

1. The config plugin adds MIME-specific `SEND` and `SEND_MULTIPLE` filters to the main activity.
2. It sets `singleTask`/`documentLaunchMode=never` for new-intent delivery.
3. It adds native limit values as application metadata.
4. An Expo package registers a React activity lifecycle listener.
5. The listener buffers the launch intent before the Expo Module exists.
6. The module parses launch/new intents on a serial executor.
7. Temporary `content://` streams are copied to app no-backup storage with byte limits.
8. Payload JSON is stored in SharedPreferences and emitted to JavaScript for live shares.

### 5.2 iOS

1. The config plugin creates an app-extension target in the generated Xcode project.
2. Host and extension receive the same App Group entitlement.
3. The plugin writes extension Info.plist, entitlements, privacy manifest, and generated Swift source.
4. The extension reads `NSExtensionItem`/`NSItemProvider` values serially.
5. Attachments are copied into the App Group container.
6. Each payload is atomically written as one JSON file under `ExpoShareContent/Queue`.
7. The extension completes without using unsupported host-opening APIs; iOS delivery is queue-only.
8. The host Expo Module reads or removes queue files and emits pending records when observing begins or the app becomes active.

### 5.3 Web

The web module is a no-op with the same method surface. Imports must not throw.

## 6. Config plugin requirements

The plugin must:

- Be idempotent across repeated prebuild runs.
- Reject malformed Android MIME types.
- Reject empty target names, invalid identifiers, non-positive limits, and iOS deployment targets below 16.4.
- Require `ios.bundleIdentifier` for iOS.
- Derive safe extension/App Group defaults from the host identity.
- Add EAS app-extension credential metadata.
- Avoid putting extension Info.plist or entitlements into the extension Resources build phase.
- Embed the extension product in the host app target.

## 7. Safety and privacy

- File copying must enforce the configured per-item byte limit.
- Share processing must enforce the configured item-count limit.
- Generated filenames must discard paths and unsafe characters.
- iOS writes must be atomic so the host cannot read partial JSON.
- Android queue updates must be synchronized.
- Text is limited to 256 KiB and each platform accepts at most 20 pending receipts.
- Clearing removes the queue record; released attachment files are cleaned after the seven-day retention window.
- Attachment URIs must not depend on the source app retaining temporary permission.
- Logs and payloads must not be sent off-device by the package.

## 8. Acceptance criteria

### JavaScript and plugin

- Unit tests pass for API wrappers, stable-ID deduplication, option validation, Android manifest idempotency, and iOS artifact rendering.
- TypeScript library and config plugin builds pass.
- The npm tarball contains JS/type outputs, native sources, plugin JS, and the Swift extension template.

### Android

- Expo autolinking resolves both `ExpoShareContentModule` and `ExpoShareContentPackage`.
- Example prebuild contains the configured `SEND` and `SEND_MULTIPLE` filters exactly once.
- Example Kotlin compilation passes.
- Device checks cover cold and warm text, URL, single file, and multiple-file shares.

### iOS

- Expo autolinking resolves the `ExpoShareContent` pod.
- Example prebuild contains the extension target, product dependency, embed phase, entitlements, and generated files exactly once.
- The Share Extension target builds for the simulator.
- The host `ExpoShareContent` pod builds for the simulator.
- A device-signed build verifies App Group provisioning and shares from Safari, Photos, and Files.

### Web

- The package can be imported and all APIs return safe no-op results.

## 9. Known constraints

- Expo Go cannot include the module or extension.
- App Group and extension signing are external Apple Developer/EAS concerns.
- iOS uses queue-only continuation and does not foreground the host from the Share Extension.
- Source applications vary in MIME type, UTType, filename, and metadata quality.
- Released attachment files are cleaned after seven days from receipt; the consuming app owns permanent retention.
