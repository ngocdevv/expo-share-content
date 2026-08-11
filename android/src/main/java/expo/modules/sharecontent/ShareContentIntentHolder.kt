package expo.modules.sharecontent

import android.content.Intent
import android.os.Bundle
import java.util.UUID

object ShareContentIntentHolder {
  private const val receiptIdExtra = "expo.modules.sharecontent.RECEIPT_ID"
  private val pendingIntents = linkedMapOf<String, Intent>()
  /** Receipt nonces already observed in this process. */
  private val claimedReceiptIds = linkedSetOf<String>()
  /** IDs stamped by this process; caller-supplied extras are never trusted. */
  private val trustedReceiptIds = linkedSetOf<String>()
  private var activeOwner: Any? = null
  private var activeConsumer: ((Intent) -> Unit)? = null

  @JvmStatic
  fun offer(intent: Intent): Boolean {
    return runCatching {
      if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) {
        return false
      }

      var delivery: Pair<(Intent) -> Unit, Intent>? = null
      synchronized(this) {
        val receiptId = receiptId(intent)
        if (claimedReceiptIds.contains(receiptId) || pendingIntents.containsKey(receiptId)) {
          return false
        }

        val copy = Intent(intent)
        copy.putExtra(receiptIdExtra, receiptId)
        val consumer = activeConsumer
        if (consumer == null) {
          pendingIntents[receiptId] = copy
        } else {
          markClaimed(receiptId)
          delivery = consumer to copy
        }
      }
      delivery?.let { (consumer, copy) -> consumer(copy) }
      true
    }.getOrDefault(false)
  }

  /**
   * Remove share data from an Activity's retained Intent after [offer] has copied it.
   * This prevents onResume/task restoration in the same process from replaying an
   * already-captured share. Android supplies no trustworthy cross-process operation ID,
   * so delivery remains explicitly at-least-once across process restoration.
   */
  @JvmStatic
  fun consume(intent: Intent) {
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return
    intent.action = Intent.ACTION_MAIN
    intent.type = null
    intent.data = null
    intent.clipData = null
    intent.replaceExtras(Bundle())
  }

  @Synchronized
  fun activate(owner: Any, consumer: (Intent) -> Unit): List<Intent> {
    activeOwner = owner
    activeConsumer = consumer
    val intents = pendingIntents.values.toList()
    pendingIntents.keys.forEach(::markClaimed)
    pendingIntents.clear()
    return intents
  }

  @Synchronized
  fun deactivate(owner: Any) {
    if (activeOwner !== owner) return
    activeOwner = null
    activeConsumer = null
  }

  @Synchronized
  fun markCommitted(receiptId: String) {
    if (receiptId.isBlank()) return
    markClaimed(receiptId)
  }

  /** Drop a pre-commit claim after failed parsing/copy/persistence so the same Intent can retry. */
  @Synchronized
  fun release(receiptIds: Collection<String>) {
    for (id in receiptIds) {
      if (id.isBlank()) continue
      claimedReceiptIds.remove(id)
      pendingIntents.remove(id)
    }
  }

  /**
   * Each newly observed Intent gets a random receipt nonce. Existing extras are reused only
   * when this process stamped them, preventing exported callers from spoofing a receipt ID.
   */
  @Synchronized
  fun receiptId(intent: Intent): String {
    val existing = existingReceiptId(intent)
    val receiptId = chooseReceiptId(existing, trustedReceiptIds) { UUID.randomUUID().toString() }
    trustedReceiptIds.add(receiptId)
    trimSet(trustedReceiptIds, 1_000)
    intent.putExtra(receiptIdExtra, receiptId)
    return receiptId
  }

  internal fun chooseReceiptId(
    existing: String?,
    trustedIds: Set<String>,
    create: () -> String
  ): String = existing?.takeIf(trustedIds::contains) ?: create()

  private fun existingReceiptId(intent: Intent): String? {
    val value = runCatching { intent.getStringExtra(receiptIdExtra) }.getOrNull()
    return value?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }
  }

  private fun markClaimed(receiptId: String) {
    claimedReceiptIds.add(receiptId)
    trimSet(claimedReceiptIds, 1_000)
  }

  private fun trimSet(values: LinkedHashSet<String>, maxSize: Int) {
    while (values.size > maxSize) values.remove(values.first())
  }
}
