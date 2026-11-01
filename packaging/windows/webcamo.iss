; Inno Setup script for Webcamo on Windows.
;   iscc /DAppVersion=0.1.0 packaging\windows\webcamo.iss

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}
AppName=Webcamo
AppVersion={#AppVersion}
AppPublisher=Webcamo
AppPublisherURL=https://github.com/mohamedjs/mobile-webcam
DefaultDirName={autopf}\Webcamo
DefaultGroupName=Webcamo
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=webcamo-setup-v{#AppVersion}
SetupIconFile=..\icons\webcamo.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start Webcamo when I sign in"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\windows-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Webcamo"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\Webcamo.vbs"""; IconFilename: "{app}\webcamo.ico"
Name: "{group}\Webcamo Diagnostics"; Filename: "{cmd}"; Parameters: "/K ""{app}\webcamo.cmd"" doctor"; IconFilename: "{app}\webcamo.ico"
Name: "{group}\Uninstall Webcamo"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Webcamo"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\Webcamo.vbs"""; IconFilename: "{app}\webcamo.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Webcamo"; \
  ValueData: """{sys}\wscript.exe"" ""{app}\Webcamo.vbs"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\Webcamo.vbs"""; Description: "Launch Webcamo now"; Flags: nowait postinstall skipifsilent
