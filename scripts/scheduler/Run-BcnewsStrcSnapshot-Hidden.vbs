Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\MJ\.openclaw\workspace\bcnews\scripts\scheduler\Run-BcnewsStrcSnapshot.ps1""", 0, False
