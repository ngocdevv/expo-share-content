import Foundation

@main
struct ShareQueueCodecTests {
  static func main() throws {
    let validId = "11111111-1111-1111-1111-111111111111"
    let itemId = "22222222-2222-2222-2222-222222222222"
    let valid = Data(
      "{\"id\":\"\(validId)\",\"timestamp\":1,\"source\":\"share-sheet\",\"items\":[{\"id\":\"\(itemId)\",\"type\":\"file\",\"mimeType\":null,\"uri\":\"file:///tmp/a\"}]}".utf8
    )
    precondition(ShareQueueCodec.decodeRecord(valid)?["id"] as? String == validId)

    let malformed = Data("not-json".utf8)
    precondition(ShareQueueCodec.decodeRecord(malformed) == nil)

    let invalidShape = Data("{\"id\":\"share-2\"}".utf8)
    precondition(ShareQueueCodec.decodeRecord(invalidShape) == nil)

    let missingMime = Data(
      "{\"id\":\"\(validId)\",\"timestamp\":1,\"source\":\"share-sheet\",\"items\":[{\"id\":\"\(itemId)\",\"type\":\"text\",\"text\":\"x\"}]}".utf8
    )
    precondition(ShareQueueCodec.decodeRecord(missingMime) == nil)
  }
}
