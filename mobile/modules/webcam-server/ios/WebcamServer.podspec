Pod::Spec.new do |s|
  s.name           = 'WebcamServer'
  s.version        = '1.0.0'
  s.summary        = 'Camera capture, hardware encode, and HTTP streaming server for mobile_webcam'
  s.license        = 'MIT'
  s.author         = ''
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
