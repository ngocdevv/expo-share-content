import Darwin
import ExpoModulesCore
import Foundation

public final class ExpoShareContentModule: Module {
  private let queueLock = NSLock()
  private var emittedShareIds = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("ExpoShareContent")

    Events("onShareReceived", "onShareError")

    AsyncFunction("getPendingSharesAsync") { () throws -> [[String: Any]] in
      try self.withQueueLock {
        let records = try self.readPendingShares()
        try self.cleanupExpiredFiles(pendingIds: Set(records.map(\.id)))
        return records.map(\.payload)
      }
    }

    AsyncFunction("clearPendingSharesAsync") { (shareIds: [String]?) throws in
      try self.withQueueLock {
        let selected = shareIds.map(Set.init)
        let records = try self.readPendingShares()
        let targets = records.filter { selected == nil || selected?.contains($0.id) == true }
        try self.acknowledge(records: targets)
        targets.forEach { self.emittedShareIds.remove($0.id) }
        let removedIds = Set(targets.map(\.id))
        let remainingIds = Set(records.map(\.id)).subtracting(removedIds)
        try self.cleanupExpiredFiles(pendingIds: remainingIds)
      }
    }

    AsyncFunction("releaseSharedFilesAsync") { (shareIds: [String]) throws in
      try self.withQueueLock {
        let ids = Set(shareIds)
        let pendingIds = Set(try self.readPendingShares().map(\.id))
        guard ids.isDisjoint(with: pendingIds) else {
          throw self.error(
            code: 5,
            message: "Acknowledge pending shares before releasing their managed files."
          )
        }
        try self.releaseManagedFiles(shareIds: ids)
      }
    }

    OnStartObserving("onShareReceived") {
      self.emitPendingShares()
    }

    OnAppBecomesActive {
      self.emitPendingShares()
    }
  }

  private struct QueueRecord {
    let id: String
    let payload: [String: Any]
    let url: URL
  }

  private func withQueueLock<T>(_ operation: () throws -> T) throws -> T {
    queueLock.lock()
    defer { queueLock.unlock() }
    return try withProcessQueueLock {
      try self.recoverAcknowledgementTransactions()
      return try operation()
    }
  }

  private func withProcessQueueLock<T>(_ operation: () throws -> T) throws -> T {
    let root = try rootDirectory()
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let lockURL = root.appendingPathComponent("Queue.lock")
    let descriptor = lockURL.path.withCString {
      Darwin.open($0, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    }
    guard descriptor >= 0 else {
      throw error(code: 3, message: "Unable to open the App Group queue lock.")
    }
    defer { Darwin.close(descriptor) }
    guard Darwin.lockf(descriptor, F_LOCK, 0) == 0 else {
      throw error(code: 4, message: "Unable to lock the App Group share queue.")
    }
    defer { _ = Darwin.lockf(descriptor, F_ULOCK, 0) }
    return try operation()
  }

  private func appGroupIdentifier() throws -> String {
    guard let value = Bundle.main.object(
      forInfoDictionaryKey: "ExpoShareContentAppGroup"
    ) as? String, !value.isEmpty else {
      throw error(
        code: 1,
        message:
          "ExpoShareContentAppGroup is missing. Add the react-native-share-content config plugin and rebuild the native app."
      )
    }
    return value
  }

  private func rootDirectory() throws -> URL {
    let identifier = try appGroupIdentifier()
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: identifier
    ) else {
      throw error(
        code: 2,
        message: "The App Group container \(identifier) is unavailable. Verify entitlements and signing."
      )
    }
    return container.appendingPathComponent("ExpoShareContent", isDirectory: true)
  }

  private func queueDirectory() throws -> URL {
    try rootDirectory().appendingPathComponent("Queue", isDirectory: true)
  }

  private func readPendingShares() throws -> [QueueRecord] {
    let directory = try queueDirectory()
    guard FileManager.default.fileExists(atPath: directory.path) else { return [] }

    let files = try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
    .filter { $0.pathExtension.lowercased() == "json" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

    var records = [QueueRecord]()
    for url in files {
      do {
        let data = try Data(contentsOf: url)
        guard let payload = ShareQueueCodec.decodeRecord(data),
              let id = payload["id"] as? String else {
          try quarantineRecord(at: url)
          continue
        }
        records.append(QueueRecord(id: id, payload: payload, url: url))
      } catch {
        // One unreadable/corrupt record must not hide later valid records.
        try? quarantineRecord(at: url)
      }
    }
    return records
  }

  private func quarantineRecord(at url: URL) throws {
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    let directory = try rootDirectory().appendingPathComponent("Quarantine", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent(
      "\(UUID().uuidString.lowercased())-\(url.lastPathComponent)"
    )
    try FileManager.default.moveItem(at: url, to: destination)
  }

  /**
   * Move every selected record into one transaction directory. A COMMITTED marker is
   * written atomically only after all moves succeed. On the next queue operation,
   * uncommitted transactions roll back and committed transactions finish cleanup.
   */
  private func acknowledge(records: [QueueRecord]) throws {
    guard !records.isEmpty else { return }
    let transactions = try rootDirectory().appendingPathComponent(
      "Acknowledgements",
      isDirectory: true
    )
    try FileManager.default.createDirectory(at: transactions, withIntermediateDirectories: true)
    let transaction = transactions.appendingPathComponent(
      UUID().uuidString.lowercased(),
      isDirectory: true
    )
    try FileManager.default.createDirectory(at: transaction, withIntermediateDirectories: true)

    do {
      for record in records {
        let destination = transaction.appendingPathComponent(record.url.lastPathComponent)
        try FileManager.default.moveItem(at: record.url, to: destination)
      }
      try Data("committed".utf8).write(
        to: transaction.appendingPathComponent("COMMITTED"),
        options: .atomic
      )
      // Failure here is recoverable because COMMITTED makes the transaction authoritative.
      try? FileManager.default.removeItem(at: transaction)
    } catch {
      try? rollbackAcknowledgementTransaction(at: transaction)
      throw error
    }
  }

  private func recoverAcknowledgementTransactions() throws {
    let transactions = try rootDirectory().appendingPathComponent(
      "Acknowledgements",
      isDirectory: true
    )
    guard FileManager.default.fileExists(atPath: transactions.path) else { return }
    let directories = try FileManager.default.contentsOfDirectory(
      at: transactions,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
    for transaction in directories {
      var isDirectory: ObjCBool = false
      guard FileManager.default.fileExists(atPath: transaction.path, isDirectory: &isDirectory),
            isDirectory.boolValue else { continue }
      if FileManager.default.fileExists(
        atPath: transaction.appendingPathComponent("COMMITTED").path
      ) {
        try FileManager.default.removeItem(at: transaction)
      } else {
        try rollbackAcknowledgementTransaction(at: transaction)
      }
    }
  }

  private func rollbackAcknowledgementTransaction(at transaction: URL) throws {
    guard FileManager.default.fileExists(atPath: transaction.path) else { return }
    let queue = try queueDirectory()
    try FileManager.default.createDirectory(at: queue, withIntermediateDirectories: true)
    let records = try FileManager.default.contentsOfDirectory(
      at: transaction,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ).filter { $0.pathExtension.lowercased() == "json" }
    for source in records {
      let destination = queue.appendingPathComponent(source.lastPathComponent)
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: source)
      } else {
        try FileManager.default.moveItem(at: source, to: destination)
      }
    }
    try FileManager.default.removeItem(at: transaction)
  }

  private func releaseManagedFiles(shareIds: Set<String>) throws {
    let root = try rootDirectory().appendingPathComponent("Files", isDirectory: true)
    for id in shareIds {
      guard UUID(uuidString: id) != nil else {
        throw error(code: 6, message: "Invalid share receipt ID: \(id)")
      }
      let directory = root.appendingPathComponent(id.lowercased(), isDirectory: true)
      if FileManager.default.fileExists(atPath: directory.path) {
        try FileManager.default.removeItem(at: directory)
      }
    }
  }

  private func cleanupExpiredFiles(pendingIds: Set<String>) throws {
    let root = try rootDirectory().appendingPathComponent("Files", isDirectory: true)
    guard FileManager.default.fileExists(atPath: root.path) else { return }
    let directories = try FileManager.default.contentsOfDirectory(
      at: root,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    )

    let cutoff = Date().addingTimeInterval(-7 * 24 * 60 * 60)
    for directory in directories where !pendingIds.contains(directory.lastPathComponent) {
      let modifiedAt = try directory.resourceValues(
        forKeys: [.contentModificationDateKey]
      ).contentModificationDate
      if let modifiedAt, modifiedAt < cutoff {
        try FileManager.default.removeItem(at: directory)
      }
    }
  }

  private func emitPendingShares() {
    do {
      let payloads = try withQueueLock {
        let records = try readPendingShares()
        var pendingEvents = [[String: Any]]()
        for record in records where !emittedShareIds.contains(record.id) {
          emittedShareIds.insert(record.id)
          pendingEvents.append(record.payload)
        }
        return pendingEvents
      }
      for payload in payloads {
        sendEvent("onShareReceived", payload)
      }
    } catch {
      sendEvent(
        "onShareError",
        ["code": "E_SHARE_QUEUE", "message": error.localizedDescription]
      )
    }
  }

  private func error(code: Int, message: String) -> NSError {
    NSError(
      domain: "ExpoShareContent",
      code: code,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}
