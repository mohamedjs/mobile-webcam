require 'xcodeproj'
project = Xcodeproj::Project.open('Pods/Pods.xcodeproj')
target = project.targets.find { |t| t.name == 'WebcamServer' }
file_path = '../../modules/webcam-server/ios/StreamPipeline.swift'
group = project.main_group.find_subpath('Development Pods/WebcamServer', true)
file_ref = group.new_file(file_path)
target.add_file_references([file_ref])
project.save
puts "Added StreamPipeline.swift to Pods.xcodeproj!"
