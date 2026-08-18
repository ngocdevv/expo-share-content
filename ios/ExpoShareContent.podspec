Pod::Spec.new do |s|
  s.name           = 'ExpoShareContent'
  s.version        = '0.2.0'
  s.summary        = 'Receive content shared to an Expo app.'
  s.description    = 'An Expo Module for receiving text, URLs, images, videos, audio, and files from the system share sheet.'
  s.author         = 'ngocdevv'
  s.homepage       = 'https://github.com/ngocdevv/react-native-share-content'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :http => "https://registry.npmjs.org/react-native-share-content/-/react-native-share-content-#{s.version}.tgz" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.{h,m,mm,swift,hpp,cpp}'
  s.resource_bundles = {
    'ExpoShareContent_privacy' => ['PrivacyInfo.xcprivacy']
  }
end
