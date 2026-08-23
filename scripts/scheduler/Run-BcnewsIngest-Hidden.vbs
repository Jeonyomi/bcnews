Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Run-BcnewsIngest.ps1")
exitCode = shell.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & scriptPath & """", 0, True)
WScript.Quit exitCode
