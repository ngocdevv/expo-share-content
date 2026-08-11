package expo.modules.sharecontent

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class ExpoShareContentModule : Module() {
  companion object {
    private val executor = Executors.newSingleThreadExecutor()
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val intentConsumerOwner = Any()

  override fun definition() = ModuleDefinition {
    Name("ExpoShareContent")

    Events("onShareReceived", "onShareError")

    AsyncFunction("getPendingSharesAsync") {
      executor.submit(Callable { ShareContentQueue.peek(context) }).get()
    }

    AsyncFunction("clearPendingSharesAsync") { shareIds: List<String>? ->
      executor.submit {
        ShareContentQueue.clear(context, shareIds?.toSet())
      }.get()
    }

    AsyncFunction("releaseSharedFilesAsync") { shareIds: List<String> ->
      executor.submit {
        ShareContentQueue.releaseManagedFiles(context, shareIds.toSet())
      }.get()
    }

    OnNewIntent { intent ->
      ShareContentIntentHolder.offer(intent)
    }

    OnCreate {
      ShareContentIntentHolder.activate(intentConsumerOwner) {
        enqueueIntent(it, emitEvent = true)
      }.forEach {
        enqueueIntent(it, emitEvent = false)
      }
    }

    OnDestroy {
      ShareContentIntentHolder.deactivate(intentConsumerOwner)
    }
  }

  private fun enqueueIntent(intent: Intent, emitEvent: Boolean) {
    executor.execute {
      val receiptId = runCatching { ShareContentIntentHolder.receiptId(intent) }.getOrElse {
        emitError("E_SHARE_INTENT", it.message ?: "Unable to identify shared content")
        return@execute
      }

      runCatching {
        ShareContentQueue.peekPayload(context, receiptId)?.let { existing ->
          ShareContentIntentHolder.markCommitted(receiptId)
          if (emitEvent) emitPayload(existing)
          return@runCatching
        }

        // Reject a full queue before an untrusted sender can force attachment copies.
        // The returned budget includes pending and acknowledged-but-unreleased files.
        val availableManagedBytes = ShareContentQueue.prepareForShare(context)
        val payload = ShareContentIntentParser(context, availableManagedBytes).parse(intent) ?: run {
          ShareContentIntentHolder.release(listOf(receiptId))
          return@runCatching
        }

        val committed = ShareContentQueue.enqueue(context, payload)
        if (!committed) {
          val existing = ShareContentQueue.peekPayload(context, receiptId)
          ShareContentIntentHolder.markCommitted(receiptId)
          if (emitEvent && existing != null) emitPayload(existing)
          return@runCatching
        }

        ShareContentIntentHolder.markCommitted(receiptId)
        if (emitEvent) emitPayload(payload)
      }.onFailure { error ->
        // AtomicFile makes this disk reread authoritative. On an uncertain read, preserve
        // files but release the in-process claim so delivery can retry instead of suppressing it.
        val queued = runCatching { ShareContentQueue.contains(context, receiptId) }.getOrNull()
        if (queued == true) {
          ShareContentIntentHolder.markCommitted(receiptId)
        } else {
          if (queued == false) {
            runCatching { ShareContentQueue.releaseFiles(context, setOf(receiptId)) }
          }
          ShareContentIntentHolder.release(listOf(receiptId))
        }
        emitError("E_SHARE_INTENT", error.message ?: "Unable to receive shared content")
      }
    }
  }

  private fun emitPayload(payload: JSONObject) {
    val value = ShareContentQueue.asMap(payload)
    mainHandler.post { sendEvent("onShareReceived", value) }
  }

  private fun emitError(code: String, message: String) {
    mainHandler.post {
      sendEvent("onShareError", mapOf("code" to code, "message" to message))
    }
  }
}
