import ExpoModulesCore

public class ExpoShareContentModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoShareContent")

    Events("onChange")

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }
  }
}
