package expo.modules.sharecontent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class ExpoShareContentActivityLifecycleListener(
  @Suppress("UNUSED_PARAMETER") activityContext: Context
) : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    val target = activity ?: return
    val intent = target.intent ?: return
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return

    // A non-null saved state is Activity/task restoration, not a new share operation.
    if (savedInstanceState == null) ShareContentIntentHolder.offer(intent)
    ShareContentIntentHolder.consume(intent)
    target.intent = intent
  }

  override fun onNewIntent(intent: Intent): Boolean {
    val accepted = ShareContentIntentHolder.offer(intent)
    ShareContentIntentHolder.consume(intent)
    return accepted
  }
}
