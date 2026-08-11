package expo.modules.sharecontent

import android.content.Context
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class ExpoShareContentPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context
  ): List<ReactActivityLifecycleListener> {
    return listOf(ExpoShareContentActivityLifecycleListener(activityContext))
  }
}
