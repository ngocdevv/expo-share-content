import UIKit
import UniformTypeIdentifiers
import Darwin

final class ShareViewController: UIViewController {
  private let appGroupIdentifier = __APP_GROUP__
  private let maxItems = __MAX_ITEMS__
  private let maxFileSize: Int64 = __MAX_FILE_SIZE__
  private let maxTotalSize: Int64 = __MAX_TOTAL_SIZE__
  private let hostOpenURLString = __HOST_OPEN_URL__
  private let maxTextBytes = 256 * 1024
  private let maxPendingShares = 20
  private let maxManagedStorageSize: Int64 = 1024 * 1024 * 1024
  private var copiedBinaryBytes: Int64 = 0
  private var remainingManagedStorageBytes: Int64 = 1024 * 1024 * 1024
  private var didStart = false

  private struct SharedItem: Codable {
    let id: String
    let type: String
    let mimeType: String?
    let text: String?
    let uri: String?
    let fileName: String?
    let size: Int64?

    private enum CodingKeys: String, CodingKey {
      case id, type, mimeType, text, uri, fileName, size
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encode(id, forKey: .id)
      try container.encode(type, forKey: .type)
      // Keep the JS contract stable: unknown MIME is explicit JSON null, not an omitted key.
      try container.encode(mimeType, forKey: .mimeType)
      try container.encodeIfPresent(text, forKey: .text)
      try container.encodeIfPresent(uri, forKey: .uri)
      try container.encodeIfPresent(fileName, forKey: .fileName)
      try container.encodeIfPresent(size, forKey: .size)
    }
  }

  private struct SharePayload: Codable {
    let id: String
    let timestamp: Int64
    let source: String
    let title: String?
    let items: [SharedItem]
  }

  private enum ShareExtensionError: LocalizedError {
    case appGroupUnavailable
    case emptyShare
    case itemLimitExceeded(Int)
    case itemUnavailable
    case fileTooLarge(Int64)
    case totalSizeExceeded(Int64)
    case textTooLarge(Int)
    case queueFull(Int)

    var errorDescription: String? {
      switch self {
      case .appGroupUnavailable:
        return "The shared App Group is unavailable. Rebuild the app and verify signing."
      case .emptyShare:
        return "No supported content was found."
      case .itemLimitExceeded(let limit):
        return "This app accepts at most \(limit) shared items at once."
      case .itemUnavailable:
        return "A shared item could not be loaded."
      case .fileTooLarge(let limit):
        return "A shared file exceeds the \(limit)-byte limit."
      case .totalSizeExceeded(let limit):
        return "The shared files exceed the \(limit)-byte aggregate limit."
      case .textTooLarge(let limit):
        return "Shared text exceeds the \(limit)-byte limit."
      case .queueFull(let limit):
        return "This app already has \(limit) pending shares. Open it and process them first."
      }
    }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let spinner = UIActivityIndicatorView(style: .large)
    spinner.translatesAutoresizingMaskIntoConstraints = false
    spinner.startAnimating()

    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "Preparing shared content…"
    label.textAlignment = .center
    label.textColor = .secondaryLabel

    view.addSubview(spinner)
    view.addSubview(label)
    NSLayoutConstraint.activate([
      spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -16),
      label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
      label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !didStart else { return }
    didStart = true

    Task { @MainActor in
      await receiveShare()
    }
  }

  @MainActor
  private func receiveShare() async {
    let shareId = UUID().uuidString.lowercased()
    do {
      let extensionItems = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
      let providers = extensionItems.flatMap { $0.attachments ?? [] }
      guard !providers.isEmpty else { throw ShareExtensionError.emptyShare }
      guard providers.count <= maxItems else {
        throw ShareExtensionError.itemLimitExceeded(maxItems)
      }
      remainingManagedStorageBytes = try prepareQueueAndStorageCapacity()
      copiedBinaryBytes = 0

      var sharedItems: [SharedItem] = []
      for provider in providers {
        if let item = try await load(provider: provider, shareId: shareId) {
          sharedItems.append(item)
        }
      }
      guard !sharedItems.isEmpty else { throw ShareExtensionError.emptyShare }

      let title = extensionItems.compactMap { $0.attributedTitle?.string }.first
      let payload = SharePayload(
        id: shareId,
        timestamp: Int64(Date().timeIntervalSince1970 * 1000),
        source: "share-sheet",
        title: title,
        items: sharedItems
      )
      try persist(payload)
      // Queue delivery is already durable. Auto-open is optional and uses only
      // NSExtensionContext.open; completion follows after a short best-effort window.
      openHostApp(shareId: shareId)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
        self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
      }
    } catch {
      cleanupFiles(shareId: shareId)
      presentError(error.localizedDescription)
    }
  }

  /// Best-effort jump back to the containing app after a successful share commit.
  /// Disabled when hostOpenURLString is empty (the default for App Store–safe installs).
  /// Uses only NSExtensionContext.open — Apple does not guarantee Share Extensions can
  /// foreground the containing app, and private UIApplication lookup is intentionally avoided.
  private func openHostApp(shareId: String) {
    guard let url = hostOpenURL(shareId: shareId) else { return }
    extensionContext?.open(url, completionHandler: { _ in })
  }

  private func hostOpenURL(shareId: String) -> URL? {
    let base = hostOpenURLString.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !base.isEmpty else { return nil }

    var components = URLComponents(string: base)
    if components?.scheme == nil {
      components = URLComponents(string: "\(base)://share")
    }
    guard var components else { return nil }

    var queryItems = components.queryItems ?? []
    if !queryItems.contains(where: { $0.name == "shareId" }) {
      queryItems.append(URLQueryItem(name: "shareId", value: shareId))
    }
    components.queryItems = queryItems
    return components.url
  }

  private func load(provider: NSItemProvider, shareId: String) async throws -> SharedItem? {
    let id = UUID().uuidString.lowercased()

    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      return try await loadFile(provider: provider, typeIdentifier: UTType.image.identifier, itemType: "image", id: id, shareId: shareId)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
      return try await loadFile(provider: provider, typeIdentifier: UTType.movie.identifier, itemType: "video", id: id, shareId: shareId)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) {
      return try await loadFile(provider: provider, typeIdentifier: UTType.audio.identifier, itemType: "audio", id: id, shareId: shareId)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
      return try await loadFile(provider: provider, typeIdentifier: UTType.fileURL.identifier, itemType: "file", id: id, shareId: shareId)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      return try await loadBoundedText(
        provider: provider,
        typeIdentifier: UTType.url.identifier,
        id: id,
        asURL: true
      )
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
      return try await loadBoundedText(
        provider: provider,
        typeIdentifier: UTType.text.identifier,
        id: id,
        asURL: false
      )
    }
    guard let typeIdentifier = provider.registeredTypeIdentifiers.first else { return nil }
    return try await loadFile(provider: provider, typeIdentifier: typeIdentifier, itemType: "file", id: id, shareId: shareId)
  }

  private func loadBoundedText(
    provider: NSItemProvider,
    typeIdentifier: String,
    id: String,
    asURL: Bool
  ) async throws -> SharedItem {
    let data = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
      provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let data else {
          continuation.resume(throwing: ShareExtensionError.itemUnavailable)
          return
        }
        guard data.count <= self.maxTextBytes else {
          continuation.resume(throwing: ShareExtensionError.textTooLarge(self.maxTextBytes))
          return
        }
        continuation.resume(returning: data)
      }
    }

    if asURL {
      guard
        let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16),
        let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
        let scheme = url.scheme?.lowercased(),
        ["http", "https"].contains(scheme)
      else {
        throw ShareExtensionError.itemUnavailable
      }
      let normalized = url.absoluteString
      guard normalized.utf8.count <= maxTextBytes else {
        throw ShareExtensionError.textTooLarge(maxTextBytes)
      }
      return SharedItem(
        id: id,
        type: "url",
        mimeType: "text/uri-list",
        text: normalized,
        uri: nil,
        fileName: nil,
        size: nil
      )
    }

    guard let value = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
      throw ShareExtensionError.itemUnavailable
    }
    guard value.utf8.count <= maxTextBytes else {
      throw ShareExtensionError.textTooLarge(maxTextBytes)
    }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    let isURL = URL(string: trimmed).map { ["http", "https"].contains($0.scheme?.lowercased() ?? "") } ?? false
    return SharedItem(
      id: id,
      type: isURL ? "url" : "text",
      mimeType: isURL ? "text/uri-list" : "text/plain",
      text: value,
      uri: nil,
      fileName: nil,
      size: nil
    )
  }

  private func loadFile(
    provider: NSItemProvider,
    typeIdentifier: String,
    itemType: String,
    id: String,
    shareId: String
  ) async throws -> SharedItem {
    let suggestedName = provider.suggestedName
    return try await withCheckedThrowingContinuation { continuation in
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { source, error in
        do {
          if let error { throw error }
          guard let source else { throw ShareExtensionError.itemUnavailable }
          let destination = try self.copyFile(
            at: source,
            suggestedName: suggestedName,
            shareId: shareId
          )
          let size = try self.fileSize(at: destination)
          continuation.resume(
            returning: SharedItem(
              id: id,
              type: itemType,
              mimeType: self.mimeType(
                for: destination,
                fallbackTypeIdentifier: typeIdentifier
              ),
              text: nil,
              uri: destination.absoluteString,
              fileName: suggestedName ?? destination.lastPathComponent,
              size: size
            )
          )
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func containerURL() throws -> URL {
    guard let url = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
      throw ShareExtensionError.appGroupUnavailable
    }
    return url
  }

  private func filesDirectory(shareId: String) throws -> URL {
    let directory = try containerURL()
      .appendingPathComponent("ExpoShareContent", isDirectory: true)
      .appendingPathComponent("Files", isDirectory: true)
      .appendingPathComponent(shareId, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func safeFileName(_ proposedName: String) -> String {
    let leaf = URL(fileURLWithPath: proposedName).lastPathComponent
    let cleaned = leaf.replacingOccurrences(
      of: "[^a-zA-Z0-9._ -]",
      with: "_",
      options: .regularExpression
    )
    return cleaned.isEmpty ? UUID().uuidString.lowercased() : cleaned
  }

  private func copyFile(at source: URL, suggestedName: String?, shareId: String) throws -> URL {
    let accessed = source.startAccessingSecurityScopedResource()
    defer { if accessed { source.stopAccessingSecurityScopedResource() } }

    if let declaredSize = try? fileSize(at: source), declaredSize > maxFileSize {
      throw ShareExtensionError.fileTooLarge(maxFileSize)
    }
    let aggregateLimit = min(maxTotalSize, remainingManagedStorageBytes)
    if let declaredSize = try? fileSize(at: source), copiedBinaryBytes + declaredSize > aggregateLimit {
      throw ShareExtensionError.totalSizeExceeded(aggregateLimit)
    }

    let proposedName = suggestedName ?? source.lastPathComponent
    let destination = try uniqueDestination(name: proposedName, shareId: shareId)

    guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
      throw ShareExtensionError.itemUnavailable
    }

    do {
      let input = try FileHandle(forReadingFrom: source)
      defer { try? input.close() }
      let output = try FileHandle(forWritingTo: destination)
      defer { try? output.close() }
      var total: Int64 = 0

      while let data = try input.read(upToCount: 64 * 1024), !data.isEmpty {
        total += Int64(data.count)
        guard total <= maxFileSize else {
          throw ShareExtensionError.fileTooLarge(maxFileSize)
        }
        copiedBinaryBytes += Int64(data.count)
        guard copiedBinaryBytes <= aggregateLimit else {
          throw ShareExtensionError.totalSizeExceeded(aggregateLimit)
        }
        try output.write(contentsOf: data)
      }
    } catch {
      try? FileManager.default.removeItem(at: destination)
      throw error
    }
    return destination
  }


  private func uniqueDestination(name: String, shareId: String) throws -> URL {
    let safeName = safeFileName(name)
    return try filesDirectory(shareId: shareId)
      .appendingPathComponent("\(UUID().uuidString.lowercased())-\(safeName)")
  }

  private func fileSize(at url: URL) throws -> Int64 {
    let values = try url.resourceValues(forKeys: [.fileSizeKey])
    return Int64(values.fileSize ?? 0)
  }

  private func mimeType(for url: URL, fallbackTypeIdentifier: String? = nil) -> String? {
    if let type = UTType(filenameExtension: url.pathExtension), let mime = type.preferredMIMEType {
      return mime
    }
    if let fallbackTypeIdentifier, let type = UTType(fallbackTypeIdentifier) {
      return type.preferredMIMEType
    }
    return nil
  }

  private func persist(_ payload: SharePayload) throws {
    try withQueueFileLock {
      let queueDirectory = try self.queueDirectory()
      try self.assertQueueCapacity(in: queueDirectory)
      guard try self.managedStorageBytes() <= self.maxManagedStorageSize else {
        throw ShareExtensionError.totalSizeExceeded(self.maxManagedStorageSize)
      }
      let data = try JSONEncoder().encode(payload)
      let file = queueDirectory.appendingPathComponent("\(payload.timestamp)-\(payload.id).json")
      try data.write(to: file, options: .atomic)
    }
  }

  private func prepareQueueAndStorageCapacity() throws -> Int64 {
    try withQueueFileLock {
      try self.assertQueueCapacity(in: self.queueDirectory())
      let usedBytes = try self.managedStorageBytes()
      guard usedBytes <= self.maxManagedStorageSize else {
        throw ShareExtensionError.totalSizeExceeded(self.maxManagedStorageSize)
      }
      return self.maxManagedStorageSize - usedBytes
    }
  }

  private func managedStorageBytes() throws -> Int64 {
    let filesRoot = try containerURL()
      .appendingPathComponent("ExpoShareContent", isDirectory: true)
      .appendingPathComponent("Files", isDirectory: true)
    guard FileManager.default.fileExists(atPath: filesRoot.path) else { return 0 }

    let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey]
    guard let enumerator = FileManager.default.enumerator(
      at: filesRoot,
      includingPropertiesForKeys: keys,
      options: [.skipsHiddenFiles]
    ) else {
      throw ShareExtensionError.itemUnavailable
    }

    var total: Int64 = 0
    for case let fileURL as URL in enumerator {
      let values = try fileURL.resourceValues(forKeys: Set(keys))
      guard values.isRegularFile == true else { continue }
      let (next, overflow) = total.addingReportingOverflow(Int64(values.fileSize ?? 0))
      guard !overflow, next <= maxManagedStorageSize else {
        throw ShareExtensionError.totalSizeExceeded(maxManagedStorageSize)
      }
      total = next
    }
    return total
  }

  private func queueDirectory() throws -> URL {
    let directory = try containerURL()
      .appendingPathComponent("ExpoShareContent", isDirectory: true)
      .appendingPathComponent("Queue", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func assertQueueCapacity(in queueDirectory: URL) throws {
    let pendingCount = try FileManager.default.contentsOfDirectory(
      at: queueDirectory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ).filter { $0.pathExtension.lowercased() == "json" }.count
    guard pendingCount < maxPendingShares else {
      throw ShareExtensionError.queueFull(maxPendingShares)
    }
  }

  private func withQueueFileLock<T>(_ operation: () throws -> T) throws -> T {
    let root = try containerURL().appendingPathComponent("ExpoShareContent", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let lockURL = root.appendingPathComponent("Queue.lock")
    let descriptor = lockURL.path.withCString {
      Darwin.open($0, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    }
    guard descriptor >= 0 else { throw ShareExtensionError.itemUnavailable }
    defer { Darwin.close(descriptor) }
    guard Darwin.lockf(descriptor, F_LOCK, 0) == 0 else {
      throw ShareExtensionError.itemUnavailable
    }
    defer { _ = Darwin.lockf(descriptor, F_ULOCK, 0) }
    return try operation()
  }

  private func cleanupFiles(shareId: String) {
    guard !shareId.isEmpty, shareId != ".", shareId != ".." else { return }
    let directory = try? containerURL()
      .appendingPathComponent("ExpoShareContent", isDirectory: true)
      .appendingPathComponent("Files", isDirectory: true)
      .appendingPathComponent(shareId, isDirectory: true)
    if let directory { try? FileManager.default.removeItem(at: directory) }
  }


  @MainActor
  private func presentError(_ message: String) {
    let alert = UIAlertController(title: "Unable to Share", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Close", style: .default) { [weak self] _ in
      self?.extensionContext?.cancelRequest(
        withError: NSError(domain: "ExpoShareContent", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
      )
    })
    present(alert, animated: true)
  }
}
