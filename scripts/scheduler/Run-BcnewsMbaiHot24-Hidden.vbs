' Registered as: wscript.exe //B //Nologo launcher.vbs SLOT
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
If WScript.Arguments.Count <> 1 Then WScript.Quit 64
slot = UCase(WScript.Arguments(0))
If slot <> "KOREA" And slot <> "US" And slot <> "CRYPTO" Then WScript.Quit 64
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Run-BcnewsMbaiHot24.ps1")
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & scriptPath & """ -Slot " & slot
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
