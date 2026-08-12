package expo.modules.sharecontent

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Parcelable
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

internal class ShareContentIntentParser(
  private val context: Context,
  private val availableManagedBytes: Long = Long.MAX_VALUE
) {
  companion object {
    private const val maxItemsMetadata = "expo.modules.sharecontent.MAX_SHARED_ITEMS"
    private const val maxFileSizeMetadata = "expo.modules.sharecontent.MAX_SHARED_FILE_SIZE"
    private const val maxTotalSizeMetadata = "expo.modules.sharecontent.MAX_SHARED_TOTAL_SIZE"
    private const val maxTextBytes = 256 * 1024
  }

  private val resolver = context.contentResolver
  private val maxItems: Int by lazy {
    applicationMetadata().getInt(maxItemsMetadata, 20)
  }
  private val maxFileSize: Long by lazy {
    metadataLong(maxFileSizeMetadata, 100L * 1024L * 1024L)
  }
  private val maxTotalSize: Long by lazy {
    minOf(
      metadataLong(maxTotalSizeMetadata, 250L * 1024L * 1024L),
      availableManagedBytes.coerceAtLeast(0L)
    )
  }
  private var copiedBytes = 0L

  fun parse(intent: Intent): JSONObject? {
    copiedBytes = 0L
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) {
      return null
    }

    val shareId = ShareContentIntentHolder.receiptId(intent)
    val timestamp = System.currentTimeMillis()
    val items = JSONArray()
    val sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()

    val streams = linkedSetOf<Uri>().apply {
      when (intent.action) {
        Intent.ACTION_SEND -> intent.parcelable<Uri>(Intent.EXTRA_STREAM)?.let(::add)
        Intent.ACTION_SEND_MULTIPLE ->
          addAll(intent.parcelableArrayList<Uri>(Intent.EXTRA_STREAM).orEmpty())
      }
      intent.clipData?.let { clipData ->
        for (index in 0 until clipData.itemCount) {
          clipData.getItemAt(index).uri?.let(::add)
        }
      }
    }

    val itemCount = streams.size + if (sharedText.isNullOrBlank()) 0 else 1
    if (itemCount > maxItems) {
      throw IllegalArgumentException("A share may contain at most $maxItems items")
    }

    if (!sharedText.isNullOrBlank()) {
      addItem(items, textItem(sharedText))
    }

    try {
      for (stream in streams) {
        addItem(items, fileItem(stream, intent.type, shareId, intent))
      }
    } catch (error: Throwable) {
      File(context.noBackupFilesDir, "expo-share-content/$shareId").deleteRecursively()
      throw error
    }

    if (items.length() == 0) return null

    return JSONObject().apply {
      put("id", shareId)
      put("timestamp", timestamp)
      put("source", "share-sheet")
      (
        intent.getCharSequenceExtra(Intent.EXTRA_TITLE)
          ?: intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)
      )?.toString()?.takeIf { it.isNotBlank() }
        ?.let { put("title", it) }
      put("items", items)
    }
  }

  private fun addItem(items: JSONArray, item: JSONObject) {
    if (items.length() >= maxItems) {
      throw IllegalArgumentException("A share may contain at most $maxItems items")
    }
    items.put(item)
  }

  private fun textItem(text: String): JSONObject {
    require(text.toByteArray(Charsets.UTF_8).size <= maxTextBytes) {
      "Shared text exceeds the $maxTextBytes-byte limit"
    }
    val trimmed = text.trim()
    val uri = runCatching { Uri.parse(trimmed) }.getOrNull()
    val isUrl = trimmed == text.trim() && (uri?.scheme == "http" || uri?.scheme == "https")

    return JSONObject().apply {
      put("id", UUID.randomUUID().toString().lowercase())
      put("type", if (isUrl) "url" else "text")
      put("mimeType", if (isUrl) "text/uri-list" else "text/plain")
      put("text", text)
    }
  }

  private fun fileItem(
    uri: Uri,
    fallbackMimeType: String?,
    shareId: String,
    intent: Intent
  ): JSONObject {
    require(uri.scheme == ContentResolver.SCHEME_CONTENT) {
      "Unsupported shared URI scheme: ${uri.scheme ?: "none"}"
    }
    require(hasReadGrant(uri, intent)) {
      "Shared content URI is missing a read grant: $uri"
    }
    val metadata = queryMetadata(uri)
    val mimeType = resolver.getType(uri) ?: fallbackMimeType
    val destination = copyToCache(
      uri,
      metadata.first ?: generatedFileName(mimeType),
      metadata.second,
      shareId
    )

    val itemType = when {
      mimeType?.startsWith("image/") == true -> "image"
      mimeType?.startsWith("video/") == true -> "video"
      mimeType?.startsWith("audio/") == true -> "audio"
      else -> "file"
    }

    return JSONObject().apply {
      put("id", UUID.randomUUID().toString().lowercase())
      put("type", itemType)
      put("mimeType", mimeType ?: JSONObject.NULL)
      put("uri", Uri.fromFile(destination).toString())
      put("fileName", metadata.first ?: destination.name)
      put("size", destination.length())
    }
  }

  /**
   * Accept only content:// URIs that:
   * 1. arrived on this share Intent (EXTRA_STREAM / ClipData membership),
   * 2. carry FLAG_GRANT_READ_URI_PERMISSION on the Intent (sender share contract),
   * 3. are actually readable via a URI permission check for this process.
   *
   * Ambient process access without a share-sheet grant is rejected to avoid a
   * confused-deputy path. openInputStream remains the final access gate.
   */
  private fun hasReadGrant(uri: Uri, intent: Intent): Boolean {
    if (!uriInIntent(uri, intent)) return false

    val intentGrantsRead = intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0
    if (!intentGrantsRead) return false

    return context.checkUriPermission(
      uri,
      android.os.Process.myPid(),
      android.os.Process.myUid(),
      Intent.FLAG_GRANT_READ_URI_PERMISSION
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun uriInIntent(uri: Uri, intent: Intent): Boolean {
    when (intent.action) {
      Intent.ACTION_SEND -> {
        if (intent.parcelable<Uri>(Intent.EXTRA_STREAM) == uri) return true
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        if (intent.parcelableArrayList<Uri>(Intent.EXTRA_STREAM).orEmpty().any { it == uri }) {
          return true
        }
      }
    }
    intent.clipData?.let { clipData ->
      for (index in 0 until clipData.itemCount) {
        if (clipData.getItemAt(index).uri == uri) return true
      }
    }
    return false
  }

  private fun queryMetadata(uri: Uri): Pair<String?, Long?> {
    return runCatching {
      resolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
        null,
        null,
        null
      )?.use { cursor ->
        if (!cursor.moveToFirst()) return@use Pair(null, null)
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        Pair(
          nameIndex.takeIf { it >= 0 }?.let(cursor::getString),
          sizeIndex.takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getLong)
        )
      } ?: Pair(null, null)
    }.getOrDefault(Pair(null, null))
  }

  private fun copyToCache(
    uri: Uri,
    proposedName: String,
    declaredSize: Long?,
    shareId: String
  ): File {
    if (declaredSize != null && declaredSize > maxFileSize) {
      throw IllegalArgumentException("Shared file exceeds the $maxFileSize-byte limit")
    }
    if (declaredSize != null && copiedBytes + declaredSize > maxTotalSize) {
      throw IllegalArgumentException("Shared files exceed the $maxTotalSize-byte aggregate limit")
    }

    val directory = File(context.noBackupFilesDir, "expo-share-content/$shareId")
    check(directory.mkdirs() || directory.isDirectory) { "Cannot create share cache directory" }

    val safeName = File(proposedName).name
      .replace(Regex("[^a-zA-Z0-9._ -]"), "_")
      .ifBlank { UUID.randomUUID().toString().lowercase() }
    val destination = File(directory, "${UUID.randomUUID().toString().lowercase()}-$safeName")
    val input = resolver.openInputStream(uri)
      ?: throw IllegalArgumentException("Cannot open shared URI: $uri")

    try {
      input.use { source ->
        FileOutputStream(destination).use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          var total = 0L
          while (true) {
            val count = source.read(buffer)
            if (count < 0) break
            total += count
            if (total > maxFileSize) {
              throw IllegalArgumentException("Shared file exceeds the $maxFileSize-byte limit")
            }
            if (copiedBytes + total > maxTotalSize) {
              throw IllegalArgumentException("Shared files exceed the $maxTotalSize-byte aggregate limit")
            }
            output.write(buffer, 0, count)
          }
        }
      }
    } catch (error: Throwable) {
      destination.delete()
      throw error
    }
    copiedBytes += destination.length()
    return destination
  }

  private fun generatedFileName(mimeType: String?): String {
    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
    return "shared-${System.currentTimeMillis()}${extension?.let { ".$it" }.orEmpty()}"
  }

  @Suppress("DEPRECATION")
  private inline fun <reified T : Parcelable> Intent.parcelable(key: String): T? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableExtra(key, T::class.java)
    } else {
      getParcelableExtra(key) as? T
    }
  }

  @Suppress("DEPRECATION")
  private inline fun <reified T : Parcelable> Intent.parcelableArrayList(key: String): ArrayList<T>? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableArrayListExtra(key, T::class.java)
    } else {
      getParcelableArrayListExtra(key)
    }
  }

  private fun applicationMetadata() = context.packageManager
    .getApplicationInfo(context.packageName, android.content.pm.PackageManager.GET_META_DATA)
    .metaData ?: android.os.Bundle.EMPTY

  @Suppress("DEPRECATION")
  private fun metadataLong(key: String, defaultValue: Long): Long {
    val parsed = when (val value = applicationMetadata().get(key)) {
      is Number -> value.toLong()
      is String -> value.toLongOrNull()
      else -> null
    }
    return parsed?.takeIf { it > 0L } ?: defaultValue
  }
}
