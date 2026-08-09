package expo.modules.sharecontent

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoShareContentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoShareContent")

    Events("onChange")

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }
  }
}
