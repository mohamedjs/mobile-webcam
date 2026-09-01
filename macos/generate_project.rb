# Generates Webcamo.xcodeproj: a macOS app that embeds a CoreMediaIO camera
# extension. Run with the xcodeproj gem that ships with CocoaPods:
#
#   /opt/homebrew/Cellar/cocoapods/*/libexec/bin/pod  -- see build.sh
#
# Regenerating is safe: the project is derived entirely from the sources on disk.
require 'fileutils'
require 'xcodeproj'

ROOT = File.dirname(File.expand_path(__FILE__))
TEAM = '575ZJY3Y9A'
APP_ID = 'com.mobilewebcam.app.mac'
EXT_ID = 'com.mobilewebcam.app.extension'

path = File.join(ROOT, 'Webcamo.xcodeproj')
FileUtils.rm_rf(path)
project = Xcodeproj::Project.new(path)

common = {
  'DEVELOPMENT_TEAM' => TEAM,
  'CODE_SIGN_STYLE' => 'Automatic',
  'MACOSX_DEPLOYMENT_TARGET' => '13.0',
  'SWIFT_VERSION' => '5.0',
  'ALWAYS_SEARCH_USER_PATHS' => 'NO',
  'CLANG_ENABLE_MODULES' => 'YES',
  'ENABLE_HARDENED_RUNTIME' => 'YES',
}

project.build_configurations.each do |config|
  common.each { |k, v| config.build_settings[k] = v }
  config.build_settings['ONLY_ACTIVE_ARCH'] = config.name == 'Debug' ? 'YES' : 'NO'
end

# ---------------------------------------------------------------- app target
app = project.new_target(:application, 'Webcamo', :osx, '13.0')
app_group = project.new_group('Webcamo', 'Webcamo')
%w[WebcamoApp.swift ContentView.swift ExtensionManager.swift].each do |f|
  app.add_file_references([app_group.new_file(f)])
end

app.build_configurations.each do |config|
  config.build_settings.merge!(common)
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => APP_ID,
    'PRODUCT_NAME' => 'Webcamo',
    'INFOPLIST_FILE' => 'Webcamo/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => 'Webcamo/Webcamo.entitlements',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'SWIFT_EMIT_LOC_STRINGS' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/../Frameworks'],
    'ENABLE_APP_SANDBOX' => 'YES',
  )
end

# ---------------------------------------------------------- extension target
# A camera extension is a .systemextension bundle, not a plug-in: the product
# type must be system-extension or macOS refuses to activate it.
ext = project.new_target(:application, 'WebcamoExtension', :osx, '13.0')
ext.product_type = 'com.apple.product-type.system-extension'

ext_group = project.new_group('WebcamoExtension', 'WebcamoExtension')
%w[main.swift WebcamoProviderSource.swift WebcamoDeviceSource.swift MJPEGReader.swift].each do |f|
  ext.add_file_references([ext_group.new_file(f)])
end

ext.build_configurations.each do |config|
  config.build_settings.merge!(common)
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => EXT_ID,
    'PRODUCT_NAME' => 'WebcamoExtension',
    'INFOPLIST_FILE' => 'WebcamoExtension/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => 'WebcamoExtension/WebcamoExtension.entitlements',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'WRAPPER_EXTENSION' => 'systemextension',
    'SKIP_INSTALL' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => [
      '$(inherited)', '@executable_path/../Frameworks',
      '@executable_path/../../../../Frameworks'
    ],
    'ENABLE_APP_SANDBOX' => 'YES',
  )
end

ext.product_reference.name = 'WebcamoExtension.systemextension'
ext.product_reference.path = 'WebcamoExtension.systemextension'

# The extension must be copied into Contents/Library/SystemExtensions of the
# app bundle; anywhere else and OSSystemExtensionRequest cannot find it.
copy_phase = app.new_copy_files_build_phase('Embed System Extensions')
copy_phase.symbol_dst_subfolder_spec = :wrapper
copy_phase.dst_path = 'Contents/Library/SystemExtensions'
copy_phase.add_file_reference(ext.product_reference, true)

app.add_dependency(ext)

project.save
puts "Generated #{path}"
