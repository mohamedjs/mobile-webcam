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
OutputBaseFilename=Webcamo-Setup-{#AppVersion}
SetupIconFile=..\icons\webcamo.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[Tasks]
Name: "autostart"; Description: "Start Webcamo when I sign in"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\webcamo\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Webcamo"; Filename: "{app}\webcamo.exe"; Parameters: "dashboard"
Name: "{group}\Webcamo Diagnostics"; Filename: "{app}\webcamo.exe"; Parameters: "doctor"
Name: "{group}\Uninstall Webcamo"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Webcamo"; Filename: "{app}\webcamo.exe"; Parameters: "dashboard"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Webcamo"; \
  ValueData: """{app}\webcamo.exe"" run --no-window"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\webcamo.exe"; Parameters: "dashboard"; Description: "Launch Webcamo now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM node.exe /FI ""WINDOWTITLE eq webcamo*"" /F"; Flags: runhidden; RunOnceId: "StopWebcamo"
