package expo.modules.sharecontent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONArray
import org.json.JSONObject

class ShareContentQueueTest {
  @Test
  fun `parses a valid persisted queue`() {
    val result = ShareContentQueue.parsePersistedQueue(
      "[{\"id\":\"share-1\",\"items\":[{\"id\":\"item-1\"}]}]"
    )

    assertFalse(result.wasCorrupt)
    assertEquals("share-1", result.value.getJSONObject(0).getString("id"))
  }

  @Test
  fun `quarantines malformed persisted queue input`() {
    val result = ShareContentQueue.parsePersistedQueue("not-json")

    assertTrue(result.wasCorrupt)
    assertEquals(0, result.value.length())
  }

  @Test
  fun `drops only malformed records from an otherwise valid queue`() {
    val result = ShareContentQueue.parsePersistedQueue(
      "[\"bad-record\",{\"id\":\"share-2\",\"items\":[{\"id\":\"item-2\"}]}]"
    )

    assertTrue(result.wasCorrupt)
    assertEquals(1, result.value.length())
    assertEquals("share-2", result.value.getJSONObject(0).getString("id"))
  }

  @Test
  fun `enqueue deduplicates only the same receipt nonce`() {
    val first = JSONObject()
      .put("id", "share-a")
      .put("items", JSONArray().put(JSONObject().put("id", "item-a").put("text", "same")))
    val redelivery = JSONObject()
      .put("id", "share-a")
      .put("items", JSONArray().put(JSONObject().put("id", "item-b").put("text", "same")))
    val separateIdenticalShare = JSONObject()
      .put("id", "share-b")
      .put("items", JSONArray().put(JSONObject().put("id", "item-c").put("text", "same")))

    val queue = JSONArray()
    assertTrue(ShareContentQueue.commitIfAbsent(queue, first))
    assertFalse(ShareContentQueue.commitIfAbsent(queue, redelivery))
    assertTrue(ShareContentQueue.commitIfAbsent(queue, separateIdenticalShare))
    assertEquals(2, queue.length())
    assertEquals("item-a", queue.getJSONObject(0).getJSONArray("items").getJSONObject(0).getString("id"))
    assertEquals("item-c", queue.getJSONObject(1).getJSONArray("items").getJSONObject(0).getString("id"))
  }

  @Test
  fun `receipt selection ignores caller IDs and reuses only process-trusted IDs`() {
    val callerId = "11111111-1111-1111-1111-111111111111"
    val trustedId = "22222222-2222-2222-2222-222222222222"
    val generatedId = "33333333-3333-3333-3333-333333333333"

    assertEquals(
      generatedId,
      ShareContentIntentHolder.chooseReceiptId(callerId, setOf(trustedId)) { generatedId }
    )
    assertEquals(
      trustedId,
      ShareContentIntentHolder.chooseReceiptId(trustedId, setOf(trustedId)) { "new" }
    )
  }
}
