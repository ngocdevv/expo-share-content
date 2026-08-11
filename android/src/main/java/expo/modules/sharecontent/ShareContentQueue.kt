package expo.modules.sharecontent

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

internal object ShareContentQueue {
  private const val queueFileName = ".pending-shares.json"
  private const val maxPendingShares = 20
  private const val maxManagedStorageBytes = 1024L * 1024L * 1024L
  private const val releasedFileRetentionMillis = 7L * 24L * 60L * 60L * 1000L

  internal data class PersistedQueue(val value: JSONArray, val wasCorrupt: Boolean)

  internal fun parsePersistedQueue(json: String?): PersistedQueue {
    if (json == null) return PersistedQueue(JSONArray(), false)
    return try {
      val source = JSONArray(json)
      val valid = JSONArray()
      var wasCorrupt = false
      for (index in 0 until source.length()) {
        val payload = source.optJSONObject(index)
        if (
          payload == null ||
          payload.optString("id").isBlank() ||
          payload.optJSONArray("items") == null
        ) {
          wasCorrupt = true
        } else {
          valid.put(payload)
        }
      }
      PersistedQueue(valid, wasCorrupt)
    } catch (_: Exception) {
      PersistedQueue(JSONArray(), true)
    }
  }

  fun asMap(payload: JSONObject): Map<String, Any?> = payload.toMap()

  /** Returns true only when [payload]'s receipt nonce is newly inserted. */
  internal fun commitIfAbsent(queue: JSONArray, payload: JSONObject): Boolean {
    val id = payload.optString("id")
    if (id.isBlank()) return false
    if ((0 until queue.length()).any { queue.optJSONObject(it)?.optString("id") == id }) {
      return false
    }
    check(queue.length() < maxPendingShares) {
      "The share queue is full. Process pending shares before adding more."
    }
    queue.put(payload)
    return true
  }

  /**
   * Reserve queue count before parsing/copying and return the remaining module-managed
   * storage budget. All pending and acknowledged-but-unreleased receipt directories count.
   */
  @Synchronized
  fun prepareForShare(context: Context): Long {
    val queue = readArray(context)
    cleanupExpiredFiles(context, queue.shareIds())
    check(queue.length() < maxPendingShares) {
      "The share queue is full. Process pending shares before adding more."
    }
    return (maxManagedStorageBytes - managedStorageBytes(context)).coerceAtLeast(0L)
  }

  @Synchronized
  fun contains(context: Context, shareId: String): Boolean {
    if (shareId.isBlank()) return false
    val queue = readArray(context)
    return (0 until queue.length()).any { queue.optJSONObject(it)?.optString("id") == shareId }
  }

  @Synchronized
  fun peekPayload(context: Context, shareId: String): JSONObject? {
    if (shareId.isBlank()) return null
    val queue = readArray(context)
    for (index in 0 until queue.length()) {
      val payload = queue.optJSONObject(index) ?: continue
      if (payload.optString("id") == shareId) return payload
    }
    return null
  }

  /**
   * Commits via [AtomicFile]. A successful return means the new queue file replaced the old
   * one atomically; a thrown failure leaves the previous durable queue recoverable.
   */
  @Synchronized
  fun enqueue(context: Context, payload: JSONObject): Boolean {
    val queue = readArray(context)
    cleanupExpiredFiles(context, queue.shareIds())
    val inserted = commitIfAbsent(queue, payload)
    if (!inserted) return false
    check(managedStorageBytes(context) <= maxManagedStorageBytes) {
      "Module-managed share files exceed the $maxManagedStorageBytes-byte storage limit."
    }
    writeArray(context, queue)
    return true
  }

  @Synchronized
  fun peek(context: Context): List<Map<String, Any?>> {
    val queue = readArray(context)
    cleanupExpiredFiles(context, queue.shareIds())
    return queue.toListOfMaps()
  }

  @Synchronized
  fun clear(context: Context, shareIds: Set<String>?) {
    if (shareIds == null) {
      writeArray(context, JSONArray())
      cleanupExpiredFiles(context, emptySet())
      return
    }

    val current = readArray(context)
    val remaining = JSONArray()
    for (index in 0 until current.length()) {
      val payload = current.optJSONObject(index) ?: continue
      if (!shareIds.contains(payload.optString("id"))) remaining.put(payload)
    }
    writeArray(context, remaining)
    cleanupExpiredFiles(context, remaining.shareIds())
  }

  @Synchronized
  fun releaseManagedFiles(context: Context, shareIds: Set<String>) {
    val pendingIds = readArray(context).shareIds()
    check(shareIds.intersect(pendingIds).isEmpty()) {
      "Acknowledge pending shares before releasing their managed files."
    }
    releaseFiles(context, shareIds)
  }

  fun releaseFiles(context: Context, shareIds: Set<String>) {
    val directories = shareIds.map { id ->
      require(id.isNotBlank() && id != "." && id != ".." && File(id).name == id) {
        "Invalid share receipt ID: $id"
      }
      id to File(context.noBackupFilesDir, "expo-share-content/$id")
    }
    for ((id, directory) in directories) {
      check(!directory.exists() || directory.deleteRecursively()) {
        "Unable to delete managed files for share $id"
      }
    }
  }

  private fun cleanupExpiredFiles(context: Context, pendingIds: Set<String>) {
    val root = storageRoot(context)
    val cutoff = System.currentTimeMillis() - releasedFileRetentionMillis
    root.listFiles()?.forEach { directory ->
      if (
        directory.isDirectory &&
        !pendingIds.contains(directory.name) &&
        directory.lastModified() < cutoff
      ) {
        check(directory.deleteRecursively()) {
          "Unable to delete expired managed files for share ${directory.name}"
        }
      }
    }
  }

  private fun storageRoot(context: Context): File =
    File(context.noBackupFilesDir, "expo-share-content")

  private fun atomicQueueFile(context: Context): AtomicFile {
    val root = storageRoot(context)
    check(root.exists() || root.mkdirs()) { "Unable to create the share queue directory" }
    return AtomicFile(File(root, queueFileName))
  }

  private fun readArray(context: Context): JSONArray {
    val file = atomicQueueFile(context)
    val json = if (file.baseFile.exists()) {
      file.readFully().toString(Charsets.UTF_8)
    } else {
      null
    }
    val parsed = parsePersistedQueue(json)
    if (parsed.wasCorrupt) writeArray(context, parsed.value)
    return parsed.value
  }

  private fun writeArray(context: Context, value: JSONArray) {
    val file = atomicQueueFile(context)
    var stream: FileOutputStream? = null
    try {
      stream = file.startWrite()
      stream.write(value.toString().toByteArray(Charsets.UTF_8))
      stream.fd.sync()
      file.finishWrite(stream)
      stream = null
    } catch (error: Throwable) {
      stream?.let(file::failWrite)
      throw IllegalStateException("Unable to persist the share queue", error)
    }
  }

  private fun managedStorageBytes(context: Context): Long {
    val root = storageRoot(context)
    var total = 0L
    root.listFiles()?.forEach { entry ->
      if (!entry.isDirectory) return@forEach
      entry.walkTopDown().filter(File::isFile).forEach { file ->
        total = Math.addExact(total, file.length())
        check(total <= maxManagedStorageBytes) {
          "Module-managed share files exceed the $maxManagedStorageBytes-byte storage limit."
        }
      }
    }
    return total
  }

  private fun JSONArray.shareIds(): Set<String> = (0 until length())
    .mapNotNull { optJSONObject(it)?.optString("id")?.takeIf(String::isNotBlank) }
    .toSet()

  private fun JSONArray.toListOfMaps(): List<Map<String, Any?>> {
    return (0 until length()).mapNotNull { optJSONObject(it)?.toMap() }
  }

  private fun JSONObject.toMap(): Map<String, Any?> {
    val result = linkedMapOf<String, Any?>()
    keys().forEach { key -> result[key] = unwrap(opt(key)) }
    return result
  }

  private fun JSONArray.toList(): List<Any?> = (0 until length()).map { unwrap(opt(it)) }

  private fun unwrap(value: Any?): Any? = when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> value.toMap()
    is JSONArray -> value.toList()
    else -> value
  }
}
