import Foundation

enum ShareQueueCodec {
  private static let itemTypes = Set(["text", "url", "image", "video", "audio", "file"])

  static func decodeRecord(_ data: Data) -> [String: Any]? {
    guard
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let id = payload["id"] as? String,
      UUID(uuidString: id) != nil,
      payload["timestamp"] is NSNumber,
      payload["source"] as? String == "share-sheet",
      let items = payload["items"] as? [[String: Any]],
      !items.isEmpty,
      items.allSatisfy(validItem)
    else {
      return nil
    }
    return payload
  }

  private static func validItem(_ item: [String: Any]) -> Bool {
    guard
      let id = item["id"] as? String,
      UUID(uuidString: id) != nil,
      let type = item["type"] as? String,
      itemTypes.contains(type),
      item.keys.contains("mimeType"),
      item["mimeType"] is String || item["mimeType"] is NSNull
    else {
      return false
    }
    if let text = item["text"], !(text is String) { return false }
    if let uri = item["uri"], !(uri is String) { return false }
    if let fileName = item["fileName"], !(fileName is String) { return false }
    if let size = item["size"] as? NSNumber, size.int64Value < 0 { return false }
    return item["text"] is String || item["uri"] is String
  }
}
